#ifdef GL_ES
  precision highp float;
#endif

uniform float nonce;

void main () {
  gl_FragColor = vec4(nonce/255.0,0.0,0.0,1.0);
}
