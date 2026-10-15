// LoHalo Jr. API 1 adaptation: sosboy-san.
// GEGL-derived algorithm: LGPL-3.0-or-later; Crisp Images-derived portions: MIT.
// Production mathematics retained; unreachable diagnostic modes removed.
(() => {
  'use strict';
  const fragment = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;

uniform sampler2D t;
uniform ivec2 src,dst;
uniform vec2 scaleOverride;
out vec4 O;

const float CONTRAST=3.38589;
const float SQRT2=1.4142135623730951;

float sig(float p){return tanh(.5*CONTRAST*(p-.5));}
float extSig(float q){
  float sig1=sig(1.0);
  float slope=(1.0/sig1-sig1)*.25*CONTRAST;
  if(q<=0.0)return slope*q;
  if(q>=1.0)return slope*q+(1.0-slope);
  return (.5/sig1)*tanh(.5*CONTRAST*q-.25*CONTRAST)+.5;
}
float invSig(float p){
  float sig1=sig(1.0), sig0=-sig1;
  float slope=(1.0/sig1+sig0)*.25*CONTRAST;
  float ios=1.0/slope;
  if(p<=0.0)return p*ios;
  if(p>=1.0)return p*ios+(1.0-ios);
  float q=2.0*sig1*p+sig0;
  return (2.0/CONTRAST)*atanh(clamp(q,-.999999,.999999))+.5;
}

float srgbToLinear1(float x){
  return x<=0.04045 ? x/12.92 : pow((x+0.055)/1.055,2.4);
}
float linearToSrgb1(float x){
  x=max(x,0.0);
  return x<=0.0031308 ? 12.92*x : 1.055*pow(x,1.0/2.4)-0.055;
}
vec3 srgbToLinear(vec3 v){
  return vec3(srgbToLinear1(v.r),srgbToLinear1(v.g),srgbToLinear1(v.b));
}
vec3 linearToSrgb(vec3 v){
  return vec3(linearToSrgb1(v.r),linearToSrgb1(v.g),linearToSrgb1(v.b));
}
/* Approximate GEGL sampler interpolate_format: RaGaBaA float.
   Texture values are straight, nonlinear sRGB; convert to linear and associate alpha. */
vec4 px(ivec2 q){
  q=clamp(q,ivec2(0),src-1);
  vec4 v=texelFetch(t,q,0);
  vec3 lin=srgbToLinear(v.rgb);
  return vec4(lin*v.a,v.a);
}
vec4 toDisplay(vec4 v){
  float a=clamp(v.a,0.0,1.0);
  vec3 straight = a>1e-8 ? v.rgb/a : vec3(0.0);
  return vec4(clamp(linearToSrgb(straight),0.0,1.0),a);
}


/* Current GEGL fast Mitchell-Netravali weights. */
void mitWeights(float a,out vec4 w){
  float t1=(7.0/18.0)*a;
  float t2=1.0-a;
  float fou=(t1-1.0/3.0)*a*a;
  float one=(1.0/18.0-t1)*t2*t2;
  float t3=fou-one;
  float thr=a-fou-t3;
  float two=t2-one+t3;
  w=vec4(one,two,thr,fou);
}

/*
 GEGL convention:
   ix0 = floor(absolute_x)
   iabsolute_x = absolute_x - 0.5
   x0 = iabsolute_x - ix0
 then reflect the [-1,0,+1,+2] stencil by sign(x0).
 absolute is corner-based input coordinate.
*/
vec4 mitchellGEGL(vec2 absolutePos){
  ivec2 anchor=ivec2(floor(absolutePos));
  vec2 rel=(absolutePos-vec2(.5))-vec2(anchor);

  ivec2 sg=ivec2(rel.x>=0.0 ? 1 : -1,
                  rel.y>=0.0 ? 1 : -1);

  vec4 wx,wy;
  mitWeights(abs(rel.x),wx);
  mitWeights(abs(rel.y),wy);

  vec4 acc=vec4(0.0);
  for(int yy=0;yy<4;yy++){
    for(int xx=0;xx<4;xx++){
      int ox=xx-1, oy=yy-1;
      ivec2 qq=anchor+ivec2(ox*sg.x,oy*sg.y);
      vec4 v=px(qq);
      float ww=wx[xx]*wy[yy];

      acc.rgb += ww*vec3(invSig(v.r),invSig(v.g),invSig(v.b));
      acc.a += ww*v.a;
    }
  }

  acc.rgb=vec3(extSig(acc.r),extSig(acc.g),extSig(acc.b));
  return acc;
}

/* Exact polynomial form used by current GEGL Robidoux EWA. */
float rob(float r2){
  if(r2>=4.0)return 0.0;
  float r=sqrt(r2);
  float mir=(-103.0-36.0*SQRT2)/(7.0+72.0*SQRT2);
  if(r2>=1.0)return (r+mir)*(r-2.0)*(r-2.0);
  float a2=(45739.0+7164.0*SQRT2)/10319.0;
  float a0=(-8926.0-14328.0*SQRT2)/10319.0;
  return r2*(-3.0*r+a2)+a0;
}

/*
 Uniform isotropic specialization.
 centerPos is center-based input coordinate (= absolutePos - .5).
 For the tested manga ratios, +/-8 safely covers radius 2/scale.
*/
vec4 ewaGEGL(vec2 centerPos,vec2 scaleXY){
  vec4 sum=vec4(0.0);
  float ws=0.0;

  ivec2 anchor=ivec2(floor(centerPos+vec2(.5)));
  vec2 x0=centerPos-vec2(anchor);

  /*
   * B12: reproduce GEGL's EWA bounding-box enumeration for the
   * axis-aligned scale used by GIMP image scaling.
   *
   * For Jinv=diag(1/sx,1/sy), GEGL's SVD/ellipse equations reduce to:
   *   c_major/minor -> axis scale coefficients
   *   bbox half width  = 2/sx
   *   bbox half height = 2/sy
   *
   * GEGL then uses ceil(x0-half) ... floor(x0+half), top-to-bottom,
   * left-to-right, before robidoux() performs the r^2 >= 4 rejection.
   */
  float halfW=2.0/scaleXY.x;
  float halfH=2.0/scaleXY.y;
  int left =int(ceil (x0.x-halfW));
  int right=int(floor(x0.x+halfW));
  int top  =int(ceil (x0.y-halfH));
  int bot  =int(floor(x0.y+halfH));

  /* LOHALO_OFFSET_0 = 13 in GEGL. */
  left =max(left ,-13); right=min(right,13);
  top  =max(top  ,-13); bot  =min(bot  ,13);

  /* Fixed shader loops, with GEGL's dynamic integer bounds applied inside. */
  for(int yy=-13;yy<=13;yy++){
    if(yy<top || yy>bot) continue;
    for(int xx=-13;xx<=13;xx++){
      if(xx<left || xx>right) continue;

      ivec2 q=anchor+ivec2(xx,yy);
      vec2 st=x0-vec2(float(xx),float(yy));
      vec2 z=st*scaleXY;
      float r2=dot(z,z);
      float ww=rob(r2); /* rob() itself returns 0 for r^2 >= 4 */

      /* GEGL ewa_newval is gfloat: ordinary float accumulation. */
      sum += px(q)*ww;
      ws += ww;
    }
  }
  return sum/ws;
}

void main(){
  /* top-left output pixel index */
  vec2 scaleXY = scaleOverride;
  vec2 invScaleXY=vec2(1.0)/scaleXY;

  /* API 1 Surface row zero is logical top. gl_FragCoord is at pixel centers.
     Host performs the final Canvas orientation conversion. */
  vec2 absolutePos=vec2(gl_FragCoord.x,
                        gl_FragCoord.y)*invScaleXY;

  /*
   GEGL transform-core maps each output pixel center independently:
     absolutePos.x = (x+.5)/sx
     absolutePos.y = (y+.5)/sy
   This matters when integer output dimensions make sx != sy slightly.
  */

  vec2 centerPos=absolutePos-vec2(.5);

  vec4 e=ewaGEGL(centerPos,scaleXY);
  vec4 m=mitchellGEGL(absolutePos);

  if(scaleXY.x>=1.0 && scaleXY.y>=1.0){O=toDisplay(m);return;}

  /* For Jinv=diag(1/sx,1/sy), ellipse_f=1/(sx*sy), hence theta=sx*sy. */
  float theta = clamp(scaleXY.x*scaleXY.y,0.0,1.0);
  O=toDisplay(theta*m+(1.0-theta)*e);
}
`;
  const descriptor = Object.freeze({
    moduleApiVersion:1, executionApiVersion:1, kind:'renderer',
    id:'lohalo-jr', name:'LoHalo Jr.', version:'2.0.0',
    implementationRevision:'public-api1-d1', author:'sosboy-san', homepage:"https://github.com/sosboy-san/Kavita-Komga-GPU-Image-Enhancer",
    license:'LGPL-3.0-or-later',
    source:'https://github.com/GNOME/gegl/blob/master/gegl/buffer/gegl-sampler-lohalo.c ; https://github.com/Ikkoru/crisp-images',
    translations:{"en": {"name": "LoHalo Jr.", "description": "A WebGL implementation based on GEGL LoHalo for comic reading. Resamples images to the display size; it is not intended to be fully compatible with GEGL.", "readme": "Resamples the image to the display size. This reader-oriented WebGL adaptation is not fully compatible with GEGL. Retain the original author credits, source links and LGPL-3.0-or-later license.\n\nGPUIE adaptation, modifications, and maintenance: sosboy-san. This is not an official GPUIE release or endorsement by the original authors and does not imply their support. Please report GPUIE issues to the GPUIE repository.", "labels": {}}, "ja": {"name": "LoHalo Jr.", "description": "GEGLのLoHaloを基にした、読書用途向けのWebGL実装です。画像を表示サイズへ拡大・縮小します。GEGLとの完全互換を意図しません。", "readme": "表示サイズに合わせて画像を拡大・縮小する読書用途向けのWebGL実装です。GEGLとの完全互換を意図しません。原作者・出典・LGPL-3.0-or-laterの表記を維持します。\n\nGPUIE向けの移植・改修・保守：sosboy-san。原作者によるGPUIEの公式版・推奨・サポートを示すものではありません。不具合報告はGPUIEの公式リポジトリへお願いします。", "labels": {}}},
    parameters:[],
    create(host) {
      let program=null, disposed=false;
      return {
        prepare() {
          if(disposed) throw Error('Disposed');
          program=host.createProgram({fragment, samplers:['t'], uniforms:{
            src:{type:'ivec2'}, dst:{type:'ivec2'}, scaleOverride:{type:'vec2'},
          }});
          return {supported:true};
        },
        execute({input,output}) {
          if(disposed||!program) throw Error('Not prepared');
          host.drawPass({program, inputs:{t:input}, output, uniforms:{
            src:[input.width,input.height], dst:[output.width,output.height],
            scaleOverride:[output.width/input.width,output.height/input.height],
          }});
          return {kind:'written'};
        },
        dispose() {
          if(disposed) return;
          disposed=true;
          if(program) host.releaseProgram(program);
          program=null;
        },
      };
    },
  });
  (globalThis.__KKGR_MODULES__??=[]).push(descriptor);
})();
