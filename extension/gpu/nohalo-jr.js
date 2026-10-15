// NoHalo Jr. API 1 adaptation: sosboy-san.
// GEGL-derived algorithm: LGPL-3.0-or-later; Crisp Images-derived portions: MIT.
// Production mathematics retained; Surface orientation adapted by the host contract.
(() => {
  'use strict';
  const fragment = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
uniform sampler2D uSrc;
uniform ivec2 uSrcSize,uDstSize;
uniform vec2 uInvScale;
out vec4 frag;

float nmin(float a,float b){return a<=b?a:b;}
float nmax(float a,float b){return a>=b?a:b;}
float nabs(float a){return a>=0.0?a:-a;}
float nsign(float a){return a>=0.0?1.0:-1.0;}

/* Exact semantics of GEGL NOHALO_MINMOD macro. */
float nminmod(float a,float b){
  float aa=a*a, ab=a*b;
  return ab>=0.0 ? (aa<=ab?a:b) : 0.0;
}
float s2l(float x){return x<=0.04045?x/12.92:pow((x+0.055)/1.055,2.4);}
float l2s(float x){x=max(x,0.0);return x<=0.0031308?12.92*x:1.055*pow(x,1.0/2.4)-0.055;}
ivec2 clampP(ivec2 p){return clamp(p,ivec2(0),uSrcSize-ivec2(1));}
vec4 px(ivec2 p){
  vec4 q=texelFetch(uSrc,clampP(p),0);
  vec3 l=vec3(s2l(q.r),s2l(q.g),s2l(q.b));
  return vec4(l*q.a,q.a);
}

/*
 * Direct scalar translation of GEGL nohalo_subdivision().
 * The input stencil is already reflected so the sample lies bottom-right
 * of tre_thr, exactly as described by the GEGL implementation.
 */
void subdiv(
 float uno_two,float uno_thr,float uno_fou,
 float dos_one,float dos_two,float dos_thr,float dos_fou,float dos_fiv,
 float tre_one,float tre_two,float tre_thr,float tre_fou,float tre_fiv,
 float qua_one,float qua_two,float qua_thr,float qua_fou,float qua_fiv,
 float cin_two,float cin_thr,float cin_fou,
 out float uno_one_1,out float uno_two_1,out float uno_thr_1,out float uno_fou_1,
 out float dos_one_1,out float dos_two_1,out float dos_thr_1,out float dos_fou_1,
 out float tre_one_1,out float tre_two_1,out float tre_thr_1,out float tre_fou_1,
 out float qua_one_1,out float qua_two_1,out float qua_thr_1,out float qua_fou_1)
{
 float d_unodos_two=dos_two-uno_two, d_dostre_two=tre_two-dos_two;
 float d_trequa_two=qua_two-tre_two, d_quacin_two=cin_two-qua_two;
 float d_unodos_thr=dos_thr-uno_thr, d_dostre_thr=tre_thr-dos_thr;
 float d_trequa_thr=qua_thr-tre_thr, d_quacin_thr=cin_thr-qua_thr;
 float d_unodos_fou=dos_fou-uno_fou, d_dostre_fou=tre_fou-dos_fou;
 float d_trequa_fou=qua_fou-tre_fou, d_quacin_fou=cin_fou-qua_fou;
 float d_dos_onetwo=dos_two-dos_one, d_dos_twothr=dos_thr-dos_two;
 float d_dos_thrfou=dos_fou-dos_thr, d_dos_foufiv=dos_fiv-dos_fou;
 float d_tre_onetwo=tre_two-tre_one, d_tre_twothr=tre_thr-tre_two;
 float d_tre_thrfou=tre_fou-tre_thr, d_tre_foufiv=tre_fiv-tre_fou;
 float d_qua_onetwo=qua_two-qua_one, d_qua_twothr=qua_thr-qua_two;
 float d_qua_thrfou=qua_fou-qua_thr, d_qua_foufiv=qua_fiv-qua_fou;

 float dos_thr_y=nminmod(d_dostre_thr,d_unodos_thr);
 float tre_thr_y=nminmod(d_dostre_thr,d_trequa_thr);
 float new_uno_two=.5*(dos_thr+tre_thr+.5*(dos_thr_y-tre_thr_y));
 float qua_thr_y=nminmod(d_quacin_thr,d_trequa_thr);
 float new_tre_two=.5*(tre_thr+qua_thr+.5*(tre_thr_y-qua_thr_y));
 float tre_fou_y=nminmod(d_dostre_fou,d_trequa_fou);
 float qua_fou_y=nminmod(d_quacin_fou,d_trequa_fou);
 float new_tre_fou=.5*(tre_fou+qua_fou+.5*(tre_fou_y-qua_fou_y));
 float dos_fou_y=nminmod(d_dostre_fou,d_unodos_fou);
 float new_uno_fou=.5*(dos_fou+tre_fou+.5*(dos_fou_y-tre_fou_y));

 float tre_two_x=nminmod(d_tre_twothr,d_tre_onetwo);
 float tre_thr_x=nminmod(d_tre_twothr,d_tre_thrfou);
 float new_dos_one=.5*(tre_two+tre_thr+.5*(tre_two_x-tre_thr_x));
 float tre_fou_x=nminmod(d_tre_foufiv,d_tre_thrfou);
 float tre_thr_x_minus_tre_fou_x=tre_thr_x-tre_fou_x;
 float new_dos_thr=.5*(tre_thr+tre_fou+.5*tre_thr_x_minus_tre_fou_x);

 float qua_thr_x=nminmod(d_qua_twothr,d_qua_thrfou);
 float qua_fou_x=nminmod(d_qua_foufiv,d_qua_thrfou);
 float qua_thr_x_minus_qua_fou_x=qua_thr_x-qua_fou_x;
 float new_qua_thr=.5*(qua_thr+qua_fou+.5*qua_thr_x_minus_qua_fou_x);
 float qua_two_x=nminmod(d_qua_twothr,d_qua_onetwo);
 float new_qua_one=.5*(qua_two+qua_thr+.5*(qua_two_x-qua_thr_x));

 float new_tre_thr=.5*(new_tre_two+new_tre_fou+
                         .25*(tre_thr_x_minus_tre_fou_x+qua_thr_x_minus_qua_fou_x));

 float dos_thr_x=nminmod(d_dos_twothr,d_dos_thrfou);
 float dos_fou_x=nminmod(d_dos_foufiv,d_dos_thrfou);
 float new_uno_thr=.5*(new_uno_two+new_dos_thr+
                        .5*(dos_fou-tre_thr+
                             .5*(dos_fou_y-tre_fou_y+dos_thr_x-dos_fou_x)));

 float tre_two_y=nminmod(d_dostre_two,d_trequa_two);
 float qua_two_y=nminmod(d_quacin_two,d_trequa_two);
 float new_tre_one=.5*(new_dos_one+new_tre_two+
                        .5*(qua_two-tre_thr+
                             .5*(qua_two_x-qua_thr_x+tre_two_y-qua_two_y)));

 float dos_two_x=nminmod(d_dos_twothr,d_dos_onetwo);
 float dos_two_y=nminmod(d_dostre_two,d_unodos_two);
 float new_uno_one=.25*(dos_two+dos_thr+tre_two+tre_thr+
                         .5*(dos_two_x-dos_thr_x+tre_two_x-tre_thr_x+
                              dos_two_y+dos_thr_y-tre_two_y-tre_thr_y));

 uno_one_1=new_uno_one; uno_two_1=new_uno_two; uno_thr_1=new_uno_thr; uno_fou_1=new_uno_fou;
 dos_one_1=new_dos_one; dos_two_1=tre_thr; dos_thr_1=new_dos_thr; dos_fou_1=tre_fou;
 tre_one_1=new_tre_one; tre_two_1=new_tre_two; tre_thr_1=new_tre_thr; tre_fou_1=new_tre_fou;
 qua_one_1=new_qua_one; qua_two_1=qua_thr; qua_thr_1=new_qua_thr; qua_fou_1=qua_fou;
}

/* Direct scalar translation of GEGL soft LBB. */
float lbb(
 float c00,float c10,float c01,float c11,
 float c00dx,float c10dx,float c01dx,float c11dx,
 float c00dy,float c10dy,float c01dy,float c11dy,
 float c00xy,float c10xy,float c01xy,float c11xy,
 float uno_one,float uno_two,float uno_thr,float uno_fou,
 float dos_one,float dos_two,float dos_thr,float dos_fou,
 float tre_one,float tre_two,float tre_thr,float tre_fou,
 float qua_one,float qua_two,float qua_thr,float qua_fou)
{
 float m1=nmin(dos_two,dos_thr), M1=nmax(dos_two,dos_thr);
 float m2=nmin(tre_two,tre_thr), M2=nmax(tre_two,tre_thr);
 float m4=nmin(qua_two,qua_thr), M4=nmax(qua_two,qua_thr);
 float m3=nmin(uno_two,uno_thr), M3=nmax(uno_two,uno_thr);
 float m5=nmin(m1,m2), M5=nmax(M1,M2);
 float m6=nmin(dos_one,tre_one), M6=nmax(dos_one,tre_one);
 float m7=nmin(dos_fou,tre_fou), M7=nmax(dos_fou,tre_fou);
 float m13=nmin(dos_fou,qua_fou), M13=nmax(dos_fou,qua_fou);
 float m9=nmin(m5,m4), M9=nmax(M5,M4);
 float m11=nmin(m6,qua_one), M11=nmax(M6,qua_one);
 float m10=nmin(m6,uno_one), M10=nmax(M6,uno_one);
 float m8=nmin(m5,m3), M8=nmax(M5,M3);
 float m12=nmin(m7,uno_fou), M12=nmax(M7,uno_fou);
 float min11=nmin(m9,m13),max11=nmax(M9,M13);
 float min01=nmin(m9,m11),max01=nmax(M9,M11);
 float min00=nmin(m8,m10),max00=nmax(M8,M10);
 float min10=nmin(m8,m12),max10=nmax(M8,M12);

 float u11=tre_thr-min11,v11=max11-tre_thr;
 float u01=tre_two-min01,v01=max01-tre_two;
 float u00=dos_two-min00,v00=max00-dos_two;
 float u10=dos_thr-min10,v10=max10-dos_thr;

 float dx00i=dos_thr-dos_one, dy11i=qua_thr-dos_thr;
 float dx10i=dos_fou-dos_two, dy01i=qua_two-dos_two;
 float dx01i=tre_thr-tre_one, dy10i=tre_thr-uno_thr;
 float dx11i=tre_fou-tre_two, dy00i=tre_two-uno_two;
 float sx00=nsign(dx00i),sx10=nsign(dx10i),sx01=nsign(dx01i),sx11=nsign(dx11i);
 float sy00=nsign(dy00i),sy10=nsign(dy10i),sy01=nsign(dy01i),sy11=nsign(dy11i);

 float xy00i=uno_one-uno_thr+dx01i;
 float xy10i=uno_two-uno_fou+dx11i;
 float xy01i=qua_thr-qua_one-dx00i;
 float xy11i=qua_fou-qua_two-dx10i;

 float sl00=6.0*nmin(u00,v00),sl10=6.0*nmin(u10,v10);
 float sl01=6.0*nmin(u01,v01),sl11=6.0*nmin(u11,v11);
 float dx00=sx00*dx00i<=sl00?dx00i:sx00*sl00;
 float dy00=sy00*dy00i<=sl00?dy00i:sy00*sl00;
 float dx10=sx10*dx10i<=sl10?dx10i:sx10*sl10;
 float dy10=sy10*dy10i<=sl10?dy10i:sy10*sl10;
 float dx01=sx01*dx01i<=sl01?dx01i:sx01*sl01;
 float dy01=sy01*dy01i<=sl01?dy01i:sy01*sl01;
 float dx11=sx11*dx11i<=sl11?dx11i:sx11*sl11;
 float dy11=sy11*dy11i<=sl11?dy11i:sy11*sl11;

 float sum00=6.0*(dx00+dy00),dif00=6.0*(dx00-dy00);
 float sum10=6.0*(dx10+dy10),dif10=6.0*(dx10-dy10);
 float sum01=6.0*(dx01+dy01),dif01=6.0*(dx01-dy01);
 float sum11=6.0*(dx11+dy11),dif11=6.0*(dx11-dy11);
 float U00=36.0*u00,U10=36.0*u10,U01=36.0*u01,U11=36.0*u11;
 float V00=36.0*v00,V10=36.0*v10,V01=36.0*v01,V11=36.0*v11;

 float z00=nmax(xy00i,nabs(sum00)-U00);
 float z10=nmax(xy10i,nabs(sum10)-U10);
 float z01=nmax(xy01i,nabs(sum01)-U01);
 float z11=nmax(xy11i,nabs(sum11)-U11);
 z00=nmin(z00,V00-nabs(sum00)); z10=nmin(z10,V10-nabs(sum10));
 z01=nmin(z01,V01-nabs(sum01)); z11=nmin(z11,V11-nabs(sum11));
 z00=nmax(z00,nabs(dif00)-V00); z10=nmax(z10,nabs(dif10)-V10);
 z01=nmax(z01,nabs(dif01)-V01); z11=nmax(z11,nabs(dif11)-V11);
 z00=nmin(z00,U00-nabs(dif00)); z10=nmin(z10,U10-nabs(dif10));
 z01=nmin(z01,U01-nabs(dif01)); z11=nmin(z11,U11-nabs(dif11));

 float v1=c00*dos_two+c10*dos_thr+c01*tre_two+c11*tre_thr;
 float v2=c00dx*dx00+c10dx*dx10+c01dx*dx01+c11dx*dx11+
          c00dy*dy00+c10dy*dy10+c01dy*dy01+c11dy*dy11;
 float v3=c00xy*z00+c10xy*z10+c01xy*z01+c11xy*z11;
 return v1+.5*(v2+.5*v3);
}

/* GEGL NoHalo clamped teepee EWA; axis-aligned reader specialization. */
void ewaNoHalo(ivec2 A,vec2 r,out vec4 ewaSum,out float totalWeight){
 vec2 radius=max(uInvScale,vec2(1.0));
 int left =max(int(ceil (r.x-radius.x)),-13);
 int right=min(int(floor(r.x+radius.x)), 13);
 int top  =max(int(ceil (r.y-radius.y)),-13);
 int bot  =min(int(floor(r.y+radius.y)), 13);

 ewaSum=vec4(0.0);
 totalWeight=0.0;

 /* GEGL enumeration order: top-to-bottom, left-to-right. */
 for(int i=-13;i<=13;i++){
  if(i<top || i>bot)continue;
  for(int j=-13;j<=13;j++){
   if(j<left || j>right)continue;
   vec2 d=r-vec2(float(j),float(i));
   vec2 q=d/radius;
   float r2=dot(q,q);
   float weight=r2<1.0?1.0-sqrt(r2):0.0;
   totalWeight+=weight;
   ewaSum+=weight*px(A+ivec2(j,i));
  }
 }
}

float channel(int ch,ivec2 A,ivec2 dir,
 float c00,float c10,float c01,float c11,
 float c00dx,float c10dx,float c01dx,float c11dx,
 float c00dy,float c10dy,float c01dy,float c11dy,
 float c00xy,float c10xy,float c01xy,float c11xy)
{
 #define P(X,Y) px(A+ivec2((X)*dir.x,(Y)*dir.y))[ch]
 float u1,u2,u3,u4,d1,d2,d3,d4,t1,t2,t3,t4,q1,q2,q3,q4;
 subdiv(P(-1,-2),P(0,-2),P(1,-2),
        P(-2,-1),P(-1,-1),P(0,-1),P(1,-1),P(2,-1),
        P(-2,0),P(-1,0),P(0,0),P(1,0),P(2,0),
        P(-2,1),P(-1,1),P(0,1),P(1,1),P(2,1),
        P(-1,2),P(0,2),P(1,2),
        u1,u2,u3,u4,d1,d2,d3,d4,t1,t2,t3,t4,q1,q2,q3,q4);
 #undef P
 return lbb(c00,c10,c01,c11,c00dx,c10dx,c01dx,c11dx,
            c00dy,c10dy,c01dy,c11dy,c00xy,c10xy,c01xy,c11xy,
            u1,u2,u3,u4,d1,d2,d3,d4,t1,t2,t3,t4,q1,q2,q3,q4);
}

void main(){
 vec2 absolutePos=vec2(gl_FragCoord.x,gl_FragCoord.y)*uInvScale;
 ivec2 A=ivec2(floor(absolutePos));
 vec2 r=absolutePos-vec2(.5)-vec2(A);
 ivec2 dir=ivec2(r.x>=0.0?1:-1,r.y>=0.0?1:-1);

 float xp=(2.0*float(dir.x))*r.x,xm=xp-1.0,onepx=.5+xp,onemx=1.5-xp,xps=xp*xp,xms=xm*xm;
 float yp=(2.0*float(dir.y))*r.y,ym=yp-1.0,onepy=.5+yp,onemy=1.5-yp,yps=yp*yp,yms=ym*ym;
 float c00=4.0*onepx*onepy*xms*yms,c00dx=2.0*xp*onepy*xms*yms,c00dy=2.0*onepx*yp*xms*yms,c00xy=xp*yp*xms*yms;
 float c10=4.0*onemx*onepy*xps*yms,c10dx=2.0*xm*onepy*xps*yms,c10dy=2.0*onemx*yp*xps*yms,c10xy=xm*yp*xps*yms;
 float c01=4.0*onepx*onemy*xms*yps,c01dx=2.0*xp*onemy*xms*yps,c01dy=2.0*onepx*ym*xms*yps,c01xy=xp*ym*xms*yps;
 float c11=4.0*onemx*onemy*xps*yps,c11dx=2.0*xm*onemy*xps*yps,c11dy=2.0*onemx*ym*xps*yps,c11xy=xm*ym*xps*yps;

 float pr=channel(0,A,dir,c00,c10,c01,c11,c00dx,c10dx,c01dx,c11dx,c00dy,c10dy,c01dy,c11dy,c00xy,c10xy,c01xy,c11xy);
 float pg=channel(1,A,dir,c00,c10,c01,c11,c00dx,c10dx,c01dx,c11dx,c00dy,c10dy,c01dy,c11dy,c00xy,c10xy,c01xy,c11xy);
 float pb=channel(2,A,dir,c00,c10,c01,c11,c00dx,c10dx,c01dx,c11dx,c00dy,c10dy,c01dy,c11dy,c00xy,c10xy,c01xy,c11xy);
 float pa=channel(3,A,dir,c00,c10,c01,c11,c00dx,c10dx,c01dx,c11dx,c00dy,c10dy,c01dy,c11dy,c00xy,c10xy,c01xy,c11xy);
 vec4 result=vec4(pr,pg,pb,pa);

 /* N1-A1 path remains untouched unless at least one axis is downsampled. */
 if(uInvScale.x>1.0 || uInvScale.y>1.0){
  vec2 radius=max(uInvScale,vec2(1.0));
  float theta=1.0/(radius.x*radius.y);
  vec4 ewaSum;
  float totalWeight;
  ewaNoHalo(A,r,ewaSum,totalWeight);
  float beta=(1.0-theta)/totalWeight;
  result=theta*result+beta*ewaSum;
 }

 pa=clamp(result.a,0.0,1.0);
 vec3 lin=pa>1e-8?result.rgb/pa:vec3(0);
 frag=vec4(clamp(vec3(l2s(lin.r),l2s(lin.g),l2s(lin.b)),0.0,1.0),pa);
}`;
  const descriptor = Object.freeze({
    moduleApiVersion:1, executionApiVersion:1, kind:'renderer',
    id:'nohalo-jr', name:'NoHalo Jr.', version:'2.0.0',
    implementationRevision:'public-api1-e1', author:'sosboy-san', homepage:"https://github.com/sosboy-san/Kavita-Komga-GPU-Image-Enhancer",
    license:'LGPL-3.0-or-later',
    source:'https://github.com/GNOME/gegl/blob/master/gegl/buffer/gegl-sampler-nohalo.c ; https://github.com/Ikkoru/crisp-images',
    translations:{"en": {"name": "NoHalo Jr.", "description": "A WebGL implementation based on GEGL NoHalo for comic reading. Resamples images to the display size; it is not intended to be fully compatible with GEGL.", "readme": "Resamples the image to the display size. This reader-oriented WebGL adaptation is not fully compatible with GEGL. Retain the original author credits, source links and LGPL-3.0-or-later license.\n\nGPUIE adaptation, modifications, and maintenance: sosboy-san. This is not an official GPUIE release or endorsement by the original authors and does not imply their support. Please report GPUIE issues to the GPUIE repository.", "labels": {}}, "ja": {"name": "NoHalo Jr.", "description": "GEGLのNoHaloを基にした、読書用途向けのWebGL実装です。画像を表示サイズへ拡大・縮小します。GEGLとの完全互換を意図しません。", "readme": "表示サイズに合わせて画像を拡大・縮小する読書用途向けのWebGL実装です。GEGLとの完全互換を意図しません。原作者・出典・LGPL-3.0-or-laterの表記を維持します。\n\nGPUIE向けの移植・改修・保守：sosboy-san。原作者によるGPUIEの公式版・推奨・サポートを示すものではありません。不具合報告はGPUIEの公式リポジトリへお願いします。", "labels": {}}},
    parameters:[],
    create(host) {
      let program=null, disposed=false;
      return {
        prepare() {
          if(disposed) throw Error('Disposed');
          program=host.createProgram({fragment, samplers:['uSrc'], uniforms:{
            uSrcSize:{type:'ivec2'}, uDstSize:{type:'ivec2'}, uInvScale:{type:'vec2'},
          }});
          return {supported:true};
        },
        execute({input,output}) {
          if(disposed||!program) throw Error('Not prepared');
          host.drawPass({program, inputs:{uSrc:input}, output, uniforms:{
            uSrcSize:[input.width,input.height], uDstSize:[output.width,output.height],
            uInvScale:[input.width/output.width,input.height/output.height],
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
