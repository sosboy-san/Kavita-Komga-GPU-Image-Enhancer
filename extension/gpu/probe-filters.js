// Verification filters: no CPU readback, same dimensions, host-owned Surfaces.
(()=>{'use strict';
const fragment=`#version 300 es
precision highp float;precision highp int;precision highp sampler2D;
in vec2 v_uv;uniform sampler2D image;layout(location=0) out vec4 color;
void main(){color=texture(image,v_uv);}`;
function make(mode){return Object.freeze({moduleApiVersion:1,executionApiVersion:1,kind:'filter',id:'probe-'+mode,name:mode,version:'1.0.0',implementationRevision:'stage-c1',parameters:[],supportedStages:['pre','post'],
create(host){let p;return {prepare(){if(mode==='copy')p=host.createProgram({fragment,samplers:['image']});return {supported:true};},execute({input,output}){if(mode==='passthrough')return {kind:'passthrough'};host.drawPass({program:p,inputs:{image:input},output});return {kind:'written'};},dispose(){if(p){host.releaseProgram(p);p=null;}}};}});}
globalThis.__KKGR_PROBE_FILTERS__=Object.freeze({copy:make('copy'),passthrough:make('passthrough')});
})();
