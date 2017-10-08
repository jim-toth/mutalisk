var GL = require('gl'),
    fs = require('fs'),
    io = require('socket.io-client');
const socket = io('http://localhost:3000');
const DEFAULT_TIMEOUT = 0;

let RED, GREEN, BLUE, BLACK, VPOS, width, height,
    gl, program, vertShader, fragShader, vertices,
    vPosPtr, nonce, noncePtr, buffer, work, socket_id,
    shaderName, do_work = false, nonces = [], results = [],
    startTime, endTime;

width = 2048; // NB: Shouldn't make this more than 4000 ?
height = 1;

RED = fs.readFileSync('./src/programs/red.fs', 'utf8');
GREEN = fs.readFileSync('./src/programs/green.fs', 'utf8');
BLUE = fs.readFileSync('./src/programs/blue.fs', 'utf8');
BLACK = fs.readFileSync('./src/programs/black.fs', 'utf8');
VPOS = fs.readFileSync('./src/programs/vpos.vs', 'utf8');

init();

function init() {
  socket.on('connect', onConnect);
  socket.on('disconnect', onDisconnect);
  socket.on('error', onError);
  socket.on('start', onStart);
  socket.on('stop', onStop);

  gl = GL(width,height);
  buffer = new Uint8Array(width * height * 4);
  shaderName = 'black';
  buildProgram(BLACK);

  console.log('\n Mutalisk');
  console.log(' _______');
  console.log(' \\vv_vv/');
  console.log('  \\^v^/ ');
  console.log('   \\v/ \n');
}

function buildProgram(frag_shader_source) {
  // Clear out any previous program and create a new one
  gl.deleteProgram(program);
  program = gl.createProgram();

  // Vert Shader
  vertShader = gl.createShader(gl.VERTEX_SHADER);
  gl.shaderSource(vertShader, VPOS);
  gl.compileShader(vertShader);
  if (!gl.getShaderParameter(vertShader, gl.COMPILE_STATUS)) {
    console.log(gl.getShaderInfoLog(vertShader));
  }
  gl.attachShader(program, vertShader);

  // Frag Shader
  fragShader = gl.createShader(gl.FRAGMENT_SHADER);
  gl.shaderSource(fragShader, frag_shader_source);
  gl.compileShader(fragShader);
  if (!gl.getShaderParameter(fragShader, gl.COMPILE_STATUS)) {
    console.log(gl.getShaderInfoLog(fragShader));
  }
  gl.attachShader(program, fragShader);

  // Link and use program, clear color buffer
  gl.linkProgram(program);
  gl.useProgram(program);
  gl.clearColor(1.0,1.0,1.0,1.0);
  gl.clear(gl.COLOR_BUFFER_BIT);

  // Bind vertex position attribute vPos
  vPosPtr = gl.getAttribLocation(program, 'vPos');
  gl.enableVertexAttribArray(vPosPtr);

  // Bind nonce uniform
  noncePtr = gl.getUniformLocation(program, 'nonce');

  // Bind vertex buffer, which sets the vertices to be drawn
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  vertices = new Float32Array([1, 1,-1, 1,
                               1,-1,-1,-1]);
  gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
  gl.vertexAttribPointer(vPosPtr, 2, gl.FLOAT, false, 0, 0);
}

function loadShader(shader) {
  let shaderSource;

  switch (shader) {
    case 'red': shaderSource = RED; break;
    case 'green': shaderSource = GREEN; break;
    case 'blue': shaderSource = BLUE; break;
    default: shaderSource = BLACK;
  }

  shaderName = shader;
  buildProgram(shaderSource);
}

function unloadShader() {
  gl.deleteProgram(program);
  //gl.detachShader(program, fragShader);
}

function doWork() {
  if (nonces.length > 0) {
    setTimeout((gl, noncePtr) => {
      // set nonce
      nonce = nonces.shift();
      //console.log('nonce',nonce);
      gl.uniform1f(noncePtr, nonce%255);

      // execute shader
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      // read result
      gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, buffer);

      //console.log('buffer',buffer);

      work = [buffer[0],buffer[1],buffer[2],buffer[3]];
      results.push(work);
      //console.log('\t\t\tGPU: ', work);

      doWork();
    }, 0, gl, noncePtr);
  } else {
    submitWork();
  }
}

function submitWork() {
  endTime = (new Date()).getTime();
  let time = (endTime - startTime)/1000,
      msg = {
        hashes: results.length,
        payload: results[results.length-1],
        threads: width,
        time: time,
        hashrate: (results.length*width) / time
      };

  socket.emit('work', msg);
  console.log(`\t\t\tSubmitted work: ${msg.hashes*width} ${shaderName}`
            + ` hashes took ${msg.time}s (${msg.hashrate.toFixed(3)}h/s)`);
}

function onConnect() {
  console.log(`\tConnected to ${socket.id}`);
  socket_id = socket.id;
}

function onDisconnect(reason) {
  console.log(`\tDisconnected from ${socket_id}:`, reason);
  do_work = false;
}

function onError(error) {
  console.error(`\tError from ${socket.id}:`, error);
}

function onStart(shader, opts) {
  console.log(`\t\tGot START ${shader} from ${socket.id}`);
  console.log(`\t\t\tLoading ${shader}`);
  loadShader(shader);

  do_work = true;
  nonces = [];
  results = [];

  if (!opts) { opts = {}; }
  if (!opts.loops) { opts.loops = 100; }

  for (let i=0; i < opts.loops; i++) {
    nonces.push(i);
  }

  startTime = (new Date()).getTime();
  workSize = opts.loops;
  console.log(`\t\t\tWorking on ${width} threads`);
  doWork();
}

function onStop() {
  console.log(`\t\tGot STOP from ${socket.id}`);
  do_work = false;
  unloadShader();
}

function to_uint16_array(num) {
  return [(num & 0xffff0000) >> 16, (num & 0x0000ffff) ];
}
