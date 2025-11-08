(function() {
  "use strict";
  const loadImage = (url) => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = url;
      img.onload = () => {
        resolve(img);
      };
      img.onerror = () => {
        reject();
      };
    });
  };
  const loadJson = async (url) => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to load: ${url}`);
    const data = await res.json();
    return data;
  };
  const identity = () => {
    return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  };
  const createOrtho = (out, left, right, bottom, top) => {
    out[0] = 2 / (right - left);
    out[1] = 0;
    out[2] = 0;
    out[3] = 0;
    out[4] = 0;
    out[5] = 2 / (top - bottom);
    out[6] = 0;
    out[7] = 0;
    out[8] = 0;
    out[9] = 0;
    out[10] = 1;
    out[11] = 0;
    out[12] = -(right + left) / (right - left);
    out[13] = -(top + bottom) / (top - bottom);
    out[14] = 0;
    out[15] = 1;
    return out;
  };
  class Vector {
    x;
    y;
    constructor(x = 0, y = 0) {
      this.x = x;
      this.y = y;
    }
    set(x, y) {
      this.x = x;
      this.y = y;
    }
  }
  class Camera {
    vw;
    vh;
    projectionMatrix;
    position;
    constructor() {
      this.projectionMatrix = identity();
      this.position = new Vector();
      this.vw = 0;
      this.vh = 0;
    }
    updateProjection(vw, vh) {
      this.vw = vw;
      this.vh = vh;
      createOrtho(this.projectionMatrix, 0, vw, 0, vh);
    }
  }
  class Scene {
    layers;
    constructor() {
      this.layers = [];
    }
    addSprite(sprite) {
      let layer = this.layers.find((layer2) => layer2.isLocked === false && layer2.isStatic === sprite.isStatic && layer2.zIndex === sprite.zIndex && layer2.atlasName === sprite.atlasName);
      if (!layer) {
        layer = new SceneLayer(sprite.zIndex, sprite.isStatic, sprite.atlasName, false);
        this.layers.push(layer);
      }
      layer.add(sprite);
    }
    addLayer(layer) {
      this.layers.push(layer);
    }
  }
  class SceneLayer {
    zIndex;
    isStatic;
    atlasName;
    isLocked;
    sprites;
    constructor(zIndex, isStatic, atlasName, isLocked) {
      this.zIndex = zIndex;
      this.isStatic = isStatic;
      this.atlasName = atlasName;
      this.isLocked = isLocked;
      this.sprites = [];
    }
    add(sprite) {
      this.sprites.push(sprite);
    }
    getKey() {
      return `${this.zIndex};${this.isStatic ? "static" : "dynamic"};${this.atlasName}`;
    }
  }
  class Sprite {
    zIndex;
    atlasName;
    tileId;
    isStatic;
    position;
    scale;
    constructor(zIndex, atlasName, tileId, isStatic) {
      this.zIndex = zIndex;
      this.atlasName = atlasName;
      this.tileId = tileId;
      this.isStatic = isStatic;
      this.position = new Vector();
      this.scale = new Vector(1, 1);
    }
  }
  class Tile {
    x;
    y;
    properties;
    animation;
    constructor(x, y, tileData) {
      this.x = x;
      this.y = y;
      this.properties = tileData?.properties;
      this.animation = tileData?.animation;
    }
    getProperty(name) {
      return this.properties?.find((prop) => prop.name === name) ?? null;
    }
  }
  class SpriteAtlas {
    imageWidth;
    imageHeight;
    tileSize;
    tilesPerRow;
    totalTiles;
    data;
    constructor(json) {
      this.imageWidth = json.imageWidth;
      this.imageHeight = json.imageHeight;
      this.tileSize = json.tileSize;
      this.tilesPerRow = json.tilesPerRow;
      this.totalTiles = json.totalTiles;
      this.data = /* @__PURE__ */ new Map();
      for (const tile of json.data) {
        this.data.set(tile.id, tile);
      }
    }
    static async load(url) {
      const json = await loadJson(url);
      return new SpriteAtlas(json);
    }
    getTile(x, y) {
      const data = this.data.get(y * this.tilesPerRow + x);
      return new Tile(x, y, data);
    }
    getTileById(id) {
      const data = this.data.get(id);
      const x = id % this.tilesPerRow;
      const y = Math.floor(id / this.tilesPerRow);
      return new Tile(x, y, data);
    }
  }
  const quad = new Float32Array([
    -0.5,
    0.5,
    0,
    0,
    -0.5,
    -0.5,
    0,
    1,
    0.5,
    0.5,
    1,
    0,
    0.5,
    -0.5,
    1,
    1
  ]);
  const createSpritesData = (sprites) => {
    const data = [];
    for (const sprite of sprites) {
      data.push(sprite.position.x, sprite.position.y, sprite.scale.x, sprite.scale.y, sprite.tileId);
    }
    return new Float32Array(data);
  };
  const getImageData = (source) => {
    if (source instanceof Uint8Array) {
      return source;
    }
    let width;
    let height;
    let tmpCanvas;
    if (source instanceof HTMLCanvasElement || source instanceof OffscreenCanvas) {
      tmpCanvas = source;
      width = tmpCanvas.width;
      height = tmpCanvas.height;
    } else {
      width = source.width;
      height = source.height;
      tmpCanvas = document.createElement("canvas");
      tmpCanvas.width = width;
      tmpCanvas.height = height;
    }
    const ctx = tmpCanvas.getContext("2d");
    if (!ctx) throw new Error("Could not get 2D context");
    if (!(source instanceof HTMLCanvasElement || source instanceof OffscreenCanvas)) {
      ctx.drawImage(source, 0, 0);
    }
    return new Uint8Array(ctx.getImageData(0, 0, width, height).data);
  };
  class ShaderProgram {
    gl;
    program;
    uniforms;
    constructor(gl, vertSource, fragSource) {
      this.gl = gl;
      this.uniforms = /* @__PURE__ */ new Map();
      const vertexShader = this.compileShader(gl.VERTEX_SHADER, vertSource);
      const fragmentShader = this.compileShader(gl.FRAGMENT_SHADER, fragSource);
      this.program = gl.createProgram();
      gl.attachShader(this.program, vertexShader);
      gl.attachShader(this.program, fragmentShader);
      gl.linkProgram(this.program);
      if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
        throw new Error(gl.getProgramInfoLog(this.program) ?? "Could not link program");
      }
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);
    }
    compileShader(type, source) {
      const shader = this.gl.createShader(type);
      if (!shader) throw new Error("Could not create shader");
      this.gl.shaderSource(shader, source);
      this.gl.compileShader(shader);
      if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
        throw new Error(this.gl.getShaderInfoLog(shader) ?? "Could not compile shader");
      }
      return shader;
    }
    use() {
      this.gl.useProgram(this.program);
    }
    getUniform(name) {
      if (!this.uniforms.has(name)) {
        const loc = this.gl.getUniformLocation(this.program, name);
        if (!loc) {
          console.log("Could not get uniform location:", name);
        }
        this.uniforms.set(name, loc);
      }
      return this.uniforms.get(name);
    }
  }
  const vertexSource = `#version 300 es

layout(location = 0) in vec2 aVertexPos;
layout(location = 1) in vec2 aTexCoord;
layout(location = 2) in vec2 aTilePos;
layout(location = 3) in vec2 aTileScale;
layout(location = 4) in float aDepth;

uniform mat4 uProjectionMatrix;

out vec2 vTexCoord;
out float vDepth;

void main() {
    vTexCoord = aTexCoord;
    vDepth = aDepth;

    vec2 worldPos = aVertexPos * aTileScale + aTilePos;
    gl_Position = uProjectionMatrix * vec4(worldPos, 0.0, 1.0);
}
`;
  const fragmentSource = `#version 300 es

precision mediump float;

in vec2 vTexCoord;
in float vDepth;

uniform mediump sampler2DArray uSampler;  

out vec4 fragColor;

void main() {
    fragColor = texture(uSampler, vec3(vTexCoord, vDepth));
}
`;
  class WebglRenderer {
    canvas;
    gl;
    shaderProgram;
    vbo;
    layersMap;
    texturesMap;
    constructor(canvas) {
      this.canvas = canvas;
      this.layersMap = /* @__PURE__ */ new Map();
      this.texturesMap = /* @__PURE__ */ new Map();
    }
    async init(texturesInfo) {
      const gl = this.canvas.getContext("webgl2");
      if (!gl) throw new Error("WebGL2 not supported");
      this.gl = gl;
      for (const texInfo of texturesInfo) {
        if (texInfo.atlas) {
          this.createAtlasTexture(texInfo.atlas, texInfo.name, getImageData(texInfo.imageData));
        }
      }
      this.shaderProgram = new ShaderProgram(gl, vertexSource, fragmentSource);
      this.vbo = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
      gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);
    }
    render(scene, camera) {
      const layers = [];
      for (const sceneLayer of scene.layers.toSorted((layer1, layer2) => layer1.zIndex - layer2.zIndex)) {
        const key = sceneLayer.getKey();
        if (!this.layersMap.has(key)) {
          const layer2 = new WebglRendererLayer(this.gl, this, sceneLayer.isStatic, sceneLayer.atlasName);
          this.layersMap.set(key, layer2);
        }
        const layer = this.layersMap.get(key);
        if (layer.needsUpdate) {
          layer.upload(sceneLayer.sprites);
        }
        layers.push(layer);
      }
      this.gl.viewport(0, 0, camera.vw, camera.vh);
      this.gl.clearColor(0.5, 0.5, 0.5, 1);
      this.gl.clear(this.gl.COLOR_BUFFER_BIT);
      this.shaderProgram.use();
      this.gl.uniformMatrix4fv(this.shaderProgram.getUniform("uProjectionMatrix"), false, camera.projectionMatrix);
      for (let layer of layers) {
        layer.render();
      }
    }
    getTexture(name) {
      return this.texturesMap.get(name) ?? null;
    }
    getVBO() {
      return this.vbo;
    }
    createAtlasTexture(atlas, name, imageData) {
      const gl = this.gl;
      const pbo = gl.createBuffer();
      gl.bindBuffer(gl.PIXEL_UNPACK_BUFFER, pbo);
      gl.bufferData(gl.PIXEL_UNPACK_BUFFER, imageData, gl.STATIC_DRAW);
      gl.pixelStorei(gl.UNPACK_ROW_LENGTH, atlas.imageWidth);
      gl.pixelStorei(gl.UNPACK_IMAGE_HEIGHT, atlas.imageHeight);
      const texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, texture);
      gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 4, gl.RGBA8, atlas.tileSize, atlas.tileSize, atlas.totalTiles);
      for (let i = 0; i < atlas.totalTiles; ++i) {
        const col = i % atlas.tilesPerRow;
        const row = Math.floor(i / atlas.tilesPerRow);
        gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, col * atlas.tileSize);
        gl.pixelStorei(gl.UNPACK_SKIP_ROWS, row * atlas.tileSize);
        gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, i, atlas.tileSize, atlas.tileSize, 1, gl.RGBA, gl.UNSIGNED_BYTE, 0);
      }
      gl.deleteBuffer(pbo);
      gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.NEAREST_MIPMAP_NEAREST);
      this.texturesMap.set(name, texture);
    }
  }
  class WebglRendererLayer {
    gl;
    renderer;
    instanceBuffer;
    vao;
    isStatic;
    texName;
    needsUpdate;
    instanceCount;
    constructor(gl, rendrer, isStatic, texName) {
      this.gl = gl;
      this.renderer = rendrer;
      this.isStatic = isStatic;
      this.texName = texName;
      this.needsUpdate = true;
      this.instanceCount = 0;
      this.vao = gl.createVertexArray();
      gl.bindVertexArray(this.vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, rendrer.getVBO());
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0);
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 16, 8);
      this.instanceBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, (this.isStatic ? 1e4 : 1e3) * 5 * 4, this.isStatic ? gl.STATIC_DRAW : gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(2);
      gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 20, 0);
      gl.vertexAttribDivisor(2, 1);
      gl.enableVertexAttribArray(3);
      gl.vertexAttribPointer(3, 2, gl.FLOAT, false, 20, 8);
      gl.vertexAttribDivisor(3, 1);
      gl.enableVertexAttribArray(4);
      gl.vertexAttribPointer(4, 1, gl.FLOAT, false, 20, 16);
      gl.vertexAttribDivisor(4, 1);
      gl.bindVertexArray(null);
    }
    upload(sprites) {
      const gl = this.gl;
      gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, createSpritesData(sprites));
      if (this.isStatic) {
        this.needsUpdate = false;
      }
      this.instanceCount = sprites.length;
    }
    render() {
      const gl = this.gl;
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.renderer.getTexture(this.texName));
      gl.bindVertexArray(this.vao);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.instanceCount);
      gl.bindVertexArray(null);
    }
  }
  const requestConfig = async () => {
    const adapter = await navigator.gpu?.requestAdapter();
    const device = await adapter?.requestDevice();
    if (!device) return null;
    const format = navigator.gpu.getPreferredCanvasFormat();
    return {
      device,
      format
    };
  };
  const shaderSource = `
struct VSInput {
    @location(0) vertexPos: vec2f,
    @location(1) texCoord: vec2f,
    
    @location(2) tilePos: vec2f,
    @location(3) tileScale: vec2f,
    @location(4) depth: f32
}

struct Camera {
    projectionMatrix: mat4x4f
}

@group(0) @binding(0)
var<uniform> camera: Camera;

struct VSOutput {
    @builtin(position) pos: vec4f,
    @location(0) texCoord: vec2f,
    @location(1) depth: f32
}

@vertex
fn vs_main(input: VSInput) -> VSOutput {
    var out: VSOutput;

    out.texCoord = input.texCoord;
    out.depth = input.depth;

    let worldPos = input.vertexPos * input.tileScale + input.tilePos;
    out.pos = camera.projectionMatrix * vec4f(worldPos, 0.0, 1.0);

    return out;
}

@group(1) @binding(0)
var spriteSampler: sampler;

@group(1) @binding(1)
var spriteTexture: texture_2d_array<f32>;

@fragment
fn fs_main(input: VSOutput) -> @location(0) vec4f {
    let idx: u32 = u32(input.depth);
    return textureSample(spriteTexture, spriteSampler, input.texCoord, idx);
}
`;
  class WebgpuRenderer {
    canvas;
    ctx;
    cfg;
    pipeline;
    vbo;
    layersMap;
    texturesMap;
    cameraBuffer;
    cameraBindGroup;
    sampler;
    constructor(canvas) {
      this.layersMap = /* @__PURE__ */ new Map();
      this.texturesMap = /* @__PURE__ */ new Map();
      this.canvas = canvas;
    }
    async init(texturesInfo) {
      const gpuConfig = await requestConfig();
      if (!gpuConfig) throw new Error("WebGPU not supported");
      this.cfg = gpuConfig;
      const device = this.cfg.device;
      const ctx = this.canvas.getContext("webgpu");
      this.ctx = ctx;
      this.ctx.configure(this.cfg);
      for (const texInfo of texturesInfo) {
        if (texInfo.atlas) {
          this.createAtlasTexture(texInfo.atlas, texInfo.name, getImageData(texInfo.imageData));
        }
      }
      const shaderModule = device.createShaderModule({
        code: shaderSource
      });
      this.pipeline = device.createRenderPipeline({
        layout: "auto",
        vertex: {
          module: shaderModule,
          entryPoint: "vs_main",
          buffers: [
            {
              arrayStride: 4 * 4,
              stepMode: "vertex",
              attributes: [
                { shaderLocation: 0, offset: 0, format: "float32x2" },
                { shaderLocation: 1, offset: 2 * 4, format: "float32x2" }
              ]
            },
            {
              arrayStride: 5 * 4,
              stepMode: "instance",
              attributes: [
                { shaderLocation: 2, offset: 0, format: "float32x2" },
                { shaderLocation: 3, offset: 2 * 4, format: "float32x2" },
                { shaderLocation: 4, offset: 4 * 4, format: "float32" }
              ]
            }
          ]
        },
        fragment: {
          module: shaderModule,
          entryPoint: "fs_main",
          targets: [{ format: this.cfg.format }]
        },
        primitive: { topology: "triangle-strip" }
      });
      this.cameraBuffer = device.createBuffer({
        size: 4 * 4 * 4,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
      });
      this.cameraBindGroup = device.createBindGroup({
        layout: this.pipeline.getBindGroupLayout(0),
        entries: [{
          binding: 0,
          resource: { buffer: this.cameraBuffer }
        }]
      });
      this.sampler = device.createSampler({
        magFilter: "nearest",
        minFilter: "nearest"
      });
      this.vbo = device.createBuffer({
        size: quad.byteLength,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
      });
      device.queue.writeBuffer(this.vbo, 0, quad);
    }
    render(scene, camera) {
      const layers = [];
      for (const sceneLayer of scene.layers.toSorted((layer1, layer2) => layer1.zIndex - layer2.zIndex)) {
        const key = sceneLayer.getKey();
        if (!this.layersMap.has(key)) {
          const layer2 = new WebgpuRendererLayer(this, sceneLayer.isStatic, sceneLayer.atlasName);
          this.layersMap.set(key, layer2);
        }
        const layer = this.layersMap.get(key);
        if (layer.needsUpdate) {
          layer.upload(sceneLayer.sprites);
        }
        layers.push(layer);
      }
      this.cfg.device.queue.writeBuffer(
        this.cameraBuffer,
        0,
        camera.projectionMatrix
      );
      const encoder = this.cfg.device.createCommandEncoder();
      const pass = encoder.beginRenderPass({
        colorAttachments: [{
          clearValue: { r: 0.5, g: 0.5, b: 0.5, a: 1 },
          view: this.ctx.getCurrentTexture().createView(),
          loadOp: "clear",
          storeOp: "store"
        }]
      });
      pass.setPipeline(this.pipeline);
      pass.setBindGroup(0, this.cameraBindGroup);
      pass.setVertexBuffer(0, this.vbo);
      for (const layer of layers) {
        layer.render(pass);
      }
      pass.end();
      const commandBuffer = encoder.finish();
      this.cfg.device.queue.submit([commandBuffer]);
    }
    createAtlasTexture(atlas, name, imageData) {
      const tileSize = atlas.tileSize;
      const textureArray = this.cfg.device.createTexture({
        size: {
          width: tileSize,
          height: tileSize,
          depthOrArrayLayers: atlas.totalTiles
        },
        format: "rgba8unorm",
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT
      });
      for (let i = 0; i < atlas.totalTiles; ++i) {
        const row = Math.floor(i / atlas.tilesPerRow);
        const col = i % atlas.tilesPerRow;
        const tilePixels = new Uint8Array(tileSize * tileSize * 4);
        for (let j = 0; j < tileSize; ++j) {
          const srcStart = ((row * tileSize + j) * atlas.tilesPerRow + col) * tileSize * 4;
          const srcEnd = srcStart + tileSize * 4;
          tilePixels.set(imageData.slice(srcStart, srcEnd), j * tileSize * 4);
        }
        this.cfg.device.queue.writeTexture(
          {
            texture: textureArray,
            origin: { x: 0, y: 0, z: i }
          },
          tilePixels,
          {
            bytesPerRow: tileSize * 4,
            rowsPerImage: tileSize
          },
          {
            width: tileSize,
            height: tileSize,
            depthOrArrayLayers: 1
          }
        );
      }
      this.texturesMap.set(name, textureArray);
    }
    getConfig() {
      return this.cfg;
    }
    getTexture(name) {
      return this.texturesMap.get(name);
    }
    getPipeline() {
      return this.pipeline;
    }
    getSampler() {
      return this.sampler;
    }
  }
  class WebgpuRendererLayer {
    isStatic;
    texName;
    needsUpdate;
    instanceCount;
    renderer;
    instanceBuffer;
    textureBindGroup;
    constructor(renderer, isStatic, texName) {
      this.renderer = renderer;
      this.isStatic = isStatic;
      this.texName = texName;
      this.needsUpdate = true;
      this.instanceCount = 0;
      this.instanceBuffer = renderer.getConfig().device.createBuffer({
        size: 4 * 4 * (isStatic ? 1e4 : 1e3),
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
      });
      this.textureBindGroup = renderer.getConfig().device.createBindGroup({
        layout: renderer.getPipeline().getBindGroupLayout(1),
        entries: [
          { binding: 0, resource: renderer.getSampler() },
          {
            binding: 1,
            resource: renderer.getTexture(texName).createView()
          }
        ]
      });
    }
    upload(sprites) {
      this.renderer.getConfig().device.queue.writeBuffer(this.instanceBuffer, 0, createSpritesData(sprites));
      if (this.isStatic) {
        this.needsUpdate = false;
      }
      this.instanceCount = sprites.length;
    }
    render(pass) {
      pass.setVertexBuffer(1, this.instanceBuffer);
      pass.setBindGroup(1, this.textureBindGroup);
      pass.draw(4, this.instanceCount);
    }
  }
  const main = async () => {
    const canvas = document.createElement("canvas");
    canvas.style.position = "absolute";
    canvas.style.left = "0";
    canvas.style.top = "0";
    canvas.style.display = "block";
    document.body.appendChild(canvas);
    const camera = new Camera();
    const resize = () => {
      canvas.width = innerWidth;
      canvas.height = innerHeight;
      camera.updateProjection(canvas.width, canvas.height);
    };
    addEventListener("resize", resize);
    resize();
    const spriteAtlas = await SpriteAtlas.load("/assets/tileset.json");
    const spriteAtlasImage = await loadImage("/assets/tileset.png");
    const scene = new Scene();
    const sprites = [];
    for (let i = 0; i < 4; ++i) {
      const s = new Sprite(1, "tileset", i, false);
      s.position.set(32, 32 + i * 64);
      s.scale.set(64, 64);
      scene.addSprite(s);
      sprites.push(s);
    }
    const fpsElem = document.createElement("div");
    fpsElem.style.position = "fixed";
    fpsElem.style.left = "10px";
    fpsElem.style.top = "10px";
    fpsElem.style.color = "white";
    fpsElem.style.font = "14px monospace";
    fpsElem.style.zIndex = "9999";
    document.body.appendChild(fpsElem);
    let dt = 0;
    let lastRAF = void 0;
    let lastTime = 0;
    let frameCount = 0;
    let fps = 0;
    let renderer;
    let rendererContext;
    if (prompt('Enter "webgpu" to use WebGPU renderer, otherwise WebGL2 will be used:') === "webgpu") {
      renderer = new WebgpuRenderer(canvas);
      rendererContext = "WebGPU";
    } else {
      renderer = new WebglRenderer(canvas);
      rendererContext = "WebGL2";
    }
    await renderer.init([{
      atlas: spriteAtlas,
      name: "tileset",
      imageData: spriteAtlasImage
    }]);
    const draw = () => {
      requestAnimationFrame((t) => {
        t *= 1e-3;
        draw();
        frameCount++;
        dt = t - (lastRAF ?? t);
        if (t - lastTime >= 1) {
          fps = frameCount;
          frameCount = 0;
          lastTime = t;
          fpsElem.textContent = `${rendererContext} - FPS: ${fps}`;
        }
        lastRAF = t;
        for (let i = 0; i < sprites.length; ++i) {
          sprites[i].position.x += (i + 1) * 32 * dt;
          if (sprites[i].position.x - sprites[i].scale.x * 0.5 > camera.vw) {
            sprites[i].position.x -= camera.vw + sprites[i].scale.x;
          }
        }
        renderer.render(scene, camera);
      });
    };
    draw();
  };
  main();
})();
