// Copyright (c) 2026 sosboy-san. SPDX-License-Identifier: MIT.
// Learning example / 学習用サンプル: public GPU module API 1.0.
(() => {
  'use strict';
  const fragment = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
in vec2 v_uv;
uniform sampler2D image;
uniform float brightness;
out vec4 outColor;
void main() {
  vec4 color = texture(image, v_uv);
  outColor = vec4(clamp(color.rgb + brightness * 0.5, 0.0, 1.0), color.a);
}`;

  (globalThis.__KKGR_MODULES__ ??= []).push({
    moduleApiVersion: 1,
    executionApiVersion: 1,
    kind: 'filter',
    id: 'example.brightness',
    name: 'Brightness Example',
    version: '1.0.0',
    implementationRevision: 'brightness-1',
    author: 'sosboy-san',
    license: 'MIT',
    supportedStages: ['pre', 'post'],
    parameters: [{
      key: 'brightness', type: 'number', min: -0.5, max: 0.5,
      step: 0.01, default: 0,
      label: {key: 'example.brightness', fallback: 'Brightness'},
    }],
    translations: {
      en: {
        name: 'Brightness Example',
        description: 'A one-slider filter for learning the module API.',
        readme: 'Select this filter in one stage. Apply 0.2 to brighten, -0.2 to darken, or 0 for no change. This example adds an offset to sRGB values; it is not an exposure or paper-restoration filter.',
        labels: {'example.brightness': 'Brightness'},
      },
      ja: {
        name: '明るさサンプル',
        description: 'スライダー1本でモジュールAPIを試す学習用フィルター。',
        readme: '前後どちらか一方で選択してください。0.2で明るく、-0.2で暗く、0で変化なしになります。値を変更して適用してください。sRGB値への単純な加算であり、露出補正や紙地復元用ではありません。',
        labels: {'example.brightness': '明るさ'},
      },
    },
    create(host) {
      let program;
      return {
        prepare() {
          program = host.createProgram({
            fragment, samplers: ['image'],
            uniforms: {brightness: {type: 'float'}},
          });
          return {supported: true};
        },
        execute({input, output, parameters}) {
          if (parameters.brightness === 0) return {kind: 'passthrough'};
          host.drawPass({
            program, inputs: {image: input}, output,
            uniforms: {brightness: parameters.brightness},
          });
          return {kind: 'written'};
        },
        dispose() {
          if (program) host.releaseProgram(program);
          program = null;
        },
      };
    },
  });
})();
