// Copyright (c) 2026 sosboy-san. SPDX-License-Identifier: MIT.
/* GPU Image Enhancer API v0.8 — GPU Unsharp Mask v1.0.0
 * Independent post-filter. Separable Gaussian blur + unsharp composite.
 * Radius is Gaussian sigma in output pixels; threshold is per-channel 8-bit sRGB delta.
 * The blur is alpha-weighted to prevent transparent RGB from bleeding into edges.
 */
(() => {
  'use strict';
  const L = (key, fallback) => ({key, fallback});
  const MAX_TAPS = 18;
  const blurFragment = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
in vec2 v_uv;
uniform sampler2D image;
uniform ivec2 direction;
uniform int radiusTaps;
uniform float weights[19];
uniform bool premultiplyInput;
layout(location=0) out vec4 outColor;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  ivec2 sz = textureSize(image, 0);
  vec4 sum = vec4(0.0);
  for (int k = -18; k <= 18; ++k) {
    if (abs(k) > radiusTaps) continue;
    ivec2 q = clamp(p + direction * k, ivec2(0), sz - ivec2(1));
    vec4 c = texelFetch(image, q, 0);
    if (premultiplyInput) c.rgb *= c.a;
    sum += c * weights[abs(k)];
  }
  outColor = sum;
}`;
  const compositeFragment = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
in vec2 v_uv;
uniform sampler2D original;
uniform sampler2D blurred;
uniform float amount;
uniform float threshold;
layout(location=0) out vec4 outColor;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec4 src = texelFetch(original, p, 0);
  vec4 b = texelFetch(blurred, p, 0);
  vec3 blurRgb = b.a > 0.000001 ? b.rgb / b.a : src.rgb;
  vec3 delta = src.rgb - blurRgb;
  vec3 applied = step(vec3(threshold), abs(delta));
  vec3 rgb = src.rgb + amount * delta * applied;
  outColor = vec4(rgb, src.a);
}`;
  const descriptor = {
    moduleApiVersion: 1, executionApiVersion: 1, kind: 'filter',
    id: 'sosboy-san.gpu-usm', name: 'GPUアンシャープマスク',
    version: '1.0.1', implementationRevision: 'separable-gaussian-alpha-weighted-output-reuse1',
    supportedStages: ['post'], author: 'sosboy-san', license:'MIT', homepage:"https://github.com/sosboy-san/Kavita-Komga-GPU-Image-Enhancer", source:"https://github.com/sosboy-san/Kavita-Komga-GPU-Image-Enhancer",
    description: 'GPUによるガウスぼかしと差分合成で輪郭を強調する後フィルター。',
    readme: '正式版v1.0.1。出力Surfaceを横方向ぼかしに再利用し、作業メモリを削減。半径は出力画素単位のGaussian sigma、強度は差分倍率、閾値はsRGB 8bit階調差です。カラー・モノクロ両対応。閾値は各RGB成分ごとに適用します。半径0または強度0はパススルー。',
    translations:{"en": {"name": "GPU Unsharp Mask", "description": "Post-filter that sharpens edges with Gaussian blur and difference compositing on the GPU.", "readme": "Sharpen after resizing. Radius is Gaussian sigma in output pixels (default 3). Amount is the difference multiplier (0.5). Threshold is the per-channel sRGB 8-bit difference (0). Radius or amount 0 passes the image through. Works on color and monochrome images and uses alpha-weighted blur.", "labels": {"usm.radius": "Radius", "usm.amount": "Amount", "usm.threshold": "Threshold (0–255)"}}, "ja": {"name": "GPUアンシャープマスク", "description": "GPUによるガウスぼかしと差分合成で輪郭を強調する後フィルター。", "readme": "拡大・縮小後の輪郭を強調します。半径は出力画素単位のGaussian sigma（初期値3）、強度は差分倍率（0.5）、閾値はRGB成分ごとのsRGB 8bit階調差（0）です。半径または強度が0なら素通し。カラー・モノクロ両対応で、透明度を考慮したぼかしを使います。", "labels": {"usm.radius": "半径", "usm.amount": "強度", "usm.threshold": "閾値（0～255）"}}},
    parameters: [
      {key:'radius',type:'number',label:L('usm.radius','半径'),min:0,max:6,step:0.1,default:3},
      {key:'amount',type:'number',label:L('usm.amount','強度'),min:0,max:3,step:0.05,default:0.5},
      {key:'threshold',type:'integer',label:L('usm.threshold','閾値（0～255）'),min:0,max:255,step:1,default:0}
    ],
    create(host) {
      let blurProgram = null;
      let compositeProgram = null;
      return {
        prepare() {
          try {
            blurProgram = host.createProgram({fragment:blurFragment,samplers:['image'],uniforms:{
              direction:{type:'ivec2'},radiusTaps:{type:'int'},weights:{type:'float',length:19},premultiplyInput:{type:'bool'}
            }});
            compositeProgram = host.createProgram({fragment:compositeFragment,samplers:['original','blurred'],uniforms:{
              amount:{type:'float'},threshold:{type:'float'}
            }});
            return {supported:true};
          } catch (e) {
            if (compositeProgram) {host.releaseProgram(compositeProgram);compositeProgram=null;}
            if (blurProgram) {host.releaseProgram(blurProgram);blurProgram=null;}
            throw e;
          }
        },
        execute({input,output,parameters:p}) {
          if (p.amount===0 || p.radius===0) return {kind:'passthrough'};
          const taps = Math.min(MAX_TAPS,Math.ceil(3*p.radius));
          const weights = new Array(19).fill(0);
          let total = 0;
          for (let i=0;i<=taps;i++) {
            weights[i]=Math.exp(-0.5*(i/p.radius)*(i/p.radius));
            total+=weights[i]*(i===0?1:2);
          }
          for (let i=0;i<=taps;i++) weights[i]/=total;
          // Use output for the horizontal pass; overwrite it with the final composite.
          // Input and vertical remain separate, avoiding texture feedback.
          let vertical = null;
          try {
            vertical=host.acquireScratch({width:input.width,height:input.height});
            host.drawPass({program:blurProgram,inputs:{image:input},output,uniforms:{
              direction:[1,0],radiusTaps:taps,weights,premultiplyInput:true
            }});
            host.drawPass({program:blurProgram,inputs:{image:output},output:vertical,uniforms:{
              direction:[0,1],radiusTaps:taps,weights,premultiplyInput:false
            }});
            host.drawPass({program:compositeProgram,inputs:{original:input,blurred:vertical},output,uniforms:{
              amount:p.amount,threshold:p.threshold/255
            }});
            return {kind:'written'};
          } finally {
            if (vertical) host.releaseScratch(vertical);
          }
        },
        dispose() {
          if (compositeProgram) {host.releaseProgram(compositeProgram);compositeProgram=null;}
          if (blurProgram) {host.releaseProgram(blurProgram);blurProgram=null;}
        }
      };
    }
  };
  (globalThis.__KKGR_MODULES__ ??= []).push(descriptor);
})();
