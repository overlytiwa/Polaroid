// Live preview only. Source captures and final exports retain the full-resolution renderer.
export const VERTEX = `#version 300 es
precision highp float;
out vec2 uv;
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  uv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const COMMON = `
precision highp float;
precision highp int;
in vec2 uv;
out vec4 result;
uniform sampler2D source;
uniform vec2 size;
uniform vec2 crop;
uniform bool mirror;
vec3 original(vec2 p) {
  if (mirror) p.x = 1.0-p.x;
  return texture(source, (p-.5)*crop+.5).rgb;
}
float randomAt(uvec2 p, uint seed) {
  uint n = (p.x+1u)*374761393u + (p.y+seed+1u)*668265263u;
  n = (n ^ (n >> 13u))*1274126177u;
  return float(n ^ (n >> 16u))/4294967295.0-.5;
}
`;

export const COLOR = `#version 300 es
${COMMON}
uniform sampler2D lut;
uniform int legacy;
uniform bool adjustments;
uniform vec4 tone; // exposure, contrast, gamma, saturation
uniform vec4 levels; // black, white, temperature, tint
uniform vec3 weights;
uniform vec3 shadowTint;
uniform vec3 lightTint;
uniform vec4 textureSettings; // film grain, sensor noise, quantization step, flash
uniform vec3 zones; // shadows, highlights, legacy grain
uniform float curve[5];
uniform bool hasCurve;
uniform int mapping;
uniform bool halftone;
vec3 applyCurve(vec3 c) {
  vec3 p = clamp(c/255.0*4.0, 0.0, 3.99999);
  ivec3 i = ivec3(floor(p));
  return vec3(mix(curve[i.x],curve[i.x+1],fract(p.x)),mix(curve[i.y],curve[i.y+1],fract(p.y)),mix(curve[i.z],curve[i.z+1],fract(p.z)));
}
void main() {
  uvec2 pixel = uvec2(floor(vec2(uv.x,1.0-uv.y)*size));
  vec3 c = original(uv)*255.0;
  if (legacy==2) {
    float y = floor(dot(c,vec3(.38,.48,.14))+.5);
    c = vec3(texture(lut,vec2((y+.5)/256.0,.5)).r*255.0);
  } else if (legacy==1) {
    c = vec3(texture(lut,vec2((c.r+.5)/256.0,.5)).r,texture(lut,vec2((c.g+.5)/256.0,.5)).g,texture(lut,vec2((c.b+.5)/256.0,.5)).b)*255.0;
  }
  if (zones.z>0.0) c += randomAt(pixel,0u)*zones.z*.45;
  if (legacy==0 || adjustments) {
    if (mapping==1) { float f=max(0.0,c.g-(c.r+c.b)*.5); c+=vec3(1.5,-1.2,1.8)*f; }
    if (mapping==2) c=vec3(c.b*.8+c.g*.15,c.g*.7+c.r*.3,c.r*.85+c.b*.15);
    if (mapping==3) c=dot(c,vec3(.35,.5,.15))*vec3(1.65,.78,.3);
    if (mapping==4) { float f=max(0.0,c.g-c.r*.65-c.b*.35); c+=vec3(2.4,-1.5,.5)*f; }
    float luminance=dot(c,weights);
    c=vec3(luminance)+(c-luminance)*tone.w;
    float l=clamp(luminance/255.0,0.0,1.0), s=(1.0-l)*(1.0-l), h=l*l;
    c*=tone.x;
    if(hasCurve) c=applyCurve(c);
    c=(c-128.0)*tone.y+128.0;
    c=255.0*pow(clamp(c/255.0,0.0,1.0),vec3(1.0/tone.z));
    c=levels.x+c*(levels.y-levels.x)/255.0;
    c+=shadowTint*s+lightTint*h+(zones.x*s+zones.y*h)*.45;
    c+=vec3(levels.z+levels.w*.5,-levels.w,-levels.z+levels.w*.5);
    uvec2 grainPixel=uvec2(floor(vec2(pixel)*1200.0/size.x));
    c+=randomAt(grainPixel,0u)*textureSettings.x*(1.1-l*.5);
    if(textureSettings.y>0.0) c+=vec3(randomAt(pixel,1u),randomAt(pixel,78u),randomAt(pixel,155u))*textureSettings.y*(1.5-l);
    if(textureSettings.z>0.0) c=floor(c/textureSettings.z+.5)*textureSettings.z;
    if(halftone) {
      float cell=max(2.0,size.x/240.0);
      vec2 d=mod(vec2(pixel),cell)/cell-.5;
      c=vec3(dot(d,d)<(1.0-clamp(c.r/255.0,0.0,1.0))*.42 ? 24.0:242.0);
    }
    if(textureSettings.w>0.0) {
      vec2 p=vec2(uv.x,1.0-uv.y)-vec2(.5,.45);
      c+=max(0.0,1.0-length(p)*2.2)*textureSettings.w*vec3(65.0,65.0,68.0);
    }
  }
  result=vec4(clamp(c/255.0,0.0,1.0),1.0);
}`;

export const BLUR = `#version 300 es
precision highp float;
in vec2 uv;
out vec4 result;
uniform sampler2D image;
uniform vec2 direction;
uniform bool threshold;
uniform bool redHalation;
vec3 sampleLight(vec2 p) {
  vec3 c=texture(image,p).rgb;
  if(!threshold) return c;
  float a=pow(clamp((dot(c,vec3(.2126,.7152,.0722))*255.0-185.0)/70.0,0.0,1.0),2.0);
  return (redHalation ? vec3(1.0,48.0/255.0,14.0/255.0):c)*a;
}
void main() {
  vec3 c=sampleLight(uv)*.227027;
  c+=(sampleLight(uv+direction)+sampleLight(uv-direction))*.1945946;
  c+=(sampleLight(uv+direction*2.0)+sampleLight(uv-direction*2.0))*.1216216;
  c+=(sampleLight(uv+direction*3.0)+sampleLight(uv-direction*3.0))*.054054;
  c+=(sampleLight(uv+direction*4.0)+sampleLight(uv-direction*4.0))*.016216;
  result=vec4(c,1.0);
}`;

export const FINISH = `#version 300 es
${COMMON}
uniform sampler2D graded;
uniform sampler2D glow;
uniform sampler2D marks;
uniform vec4 effects; // glow, sharpness, aberration, vignette
uniform float vignetteWhite;
uniform float leak;
uniform float intensity;
vec3 lit(vec2 p) {
  vec3 c=texture(graded,p).rgb;
  if(effects.x>0.0) c=1.0-(1.0-c)*(1.0-texture(glow,p).rgb*effects.x);
  return c;
}
vec3 sharpen(vec2 p) {
  vec3 c=lit(p);
  if(effects.y>0.0) {
    vec2 d=vec2(max(1.0,floor(size.x/1600.0+.5))/size.x,0.0);
    c=clamp(c+effects.y*(c-(lit(p-d)+lit(p+d))*.5),0.0,1.0);
  }
  return c;
}
void main() {
  vec3 c=sharpen(uv);
  if(effects.z>0.0) {
    float shift=max(1.0,floor(size.x/650.0*effects.z+.5))/size.x;
    if(uv.x>=shift && uv.x<1.0-shift) { c.r=sharpen(uv+vec2(shift,0.0)).r; c.b=sharpen(uv-vec2(shift,0.0)).b; }
  }
  if(effects.w>0.0) {
    float distance=length((uv-.5)*size), radius=length(size*.5);
    float a=clamp((distance/radius-.45)/.6,0.0,1.0)*effects.w;
    c=mix(c,vec3(vignetteWhite),a);
  }
  if(leak>0.0) {
    // The film-edge leak is fixed in image coordinates, not in screen space.
    vec2 p=(vec2(uv.x,1.0-uv.y)-vec2(-.15,.65))*vec2(1.0,size.y/size.x);
    vec2 d=vec2(.15,-.15*size.y/size.x);
    float a=dot(d,d)-.85*.85,b=-2.0*dot(p,d);
    float t=clamp((-b-sqrt(max(0.0,b*b-4.0*a*dot(p,p))))/(2.0*a),0.0,1.0);
    vec3 first=vec3(1.0,95.0/255.0,20.0/255.0)*min(leak,1.0);
    vec3 second=vec3(190.0/255.0,35.0/255.0,15.0/255.0)*min(leak*.32,1.0);
    vec3 light=t<.5 ? mix(first,second,t*2.0):second*(1.0-(t-.5)*2.0);
    c=1.0-(1.0-c)*(1.0-light);
  }
  vec4 mark=texture(marks,uv);
  c=mix(c,mark.rgb,mark.a);
  result=vec4(mix(original(uv),c,intensity),1.0);
}`;
