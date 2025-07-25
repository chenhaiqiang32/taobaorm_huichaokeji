import * as THREE from "three";
import { LoadingManager } from "three";
// import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import { GLTFLoader } from "../../lib/GLTFLoader";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader";
import { GbkOBJLoader } from "../../lib/GbkOBJLoader";
import { loadingInstance } from "./loading";
import { postOnLoaded, postOnLoading } from "../../message/postMessage";
import { MeshoptDecoder } from "meshoptimizer";

const loadingManager = new LoadingManager(
  function onLoaded() {
    loadingInstance.close();
    postOnLoaded();
  },
  function onProgress(url, loaded, total) {
    loadingInstance.service(((100 * loaded) / total).toFixed(2));
  },
  function onError(url) {
    console.error("Error loading:", url);
    loadingInstance.close(); // 确保在出错时关闭 loading 界面
  }
);

export const loader = new GLTFLoader(loadingManager);

// 配置 DRACOLoader 以支持 Draco 压缩
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath("./draco/");
loader.setDRACOLoader(dracoLoader);

// 配置 MeshoptDecoder 以支持 meshopt 压缩
async function setupMeshoptDecoder() {
  try {
    console.log("🔄 正在初始化 MeshoptDecoder...");
    // 等待 MeshoptDecoder 初始化完成
    await MeshoptDecoder.ready;
    loader.setMeshoptDecoder(MeshoptDecoder);
    console.log("✅ MeshoptDecoder 已成功配置");
  } catch (error) {
    console.warn("⚠️ MeshoptDecoder 配置失败:", error);
  }
}

// 立即设置 MeshoptDecoder
setupMeshoptDecoder();

// 全局动画管理器
class GlobalAnimationManager {
  constructor() {
    this.mixers = new Map();
    this.materialFlows = new Map(); // 存储材质流动动画
    this.clock = new THREE.Clock();
    this.isPlaying = false;
  }

  addMixer(model, mixer) {
    this.mixers.set(model, mixer);
    this.clock.start();
  }

  addMaterialFlow(material, speedX) {
    // 为材质添加流动动画
    this.materialFlows.set(material, {
      speedX: speedX,
      originalOffset: material.userData.originalOffset,
    });
  }

  update() {
    if (this.isPlaying) {
      const delta = this.clock.getDelta();

      // 更新动画mixer
      this.mixers.forEach((mixer) => {
        mixer.update(delta);
      });

      // 更新材质流动动画
      this.materialFlows.forEach((flowData, material) => {
        if (material.map && material.map.offset) {
          // 更新纹理偏移，实现流动效果
          material.map.offset.x += flowData.speedX;

          // 可选：当偏移值过大时重置，避免数值过大
          if (material.map.offset.x > 1) {
            material.map.offset.x -= 1;
          }
        }
      });
    }
  }

  play() {
    this.isPlaying = true;
  }

  stop() {
    this.isPlaying = false;
  }

  // 移除材质流动动画
  removeMaterialFlow(material) {
    this.materialFlows.delete(material);
  }

  // 清理所有材质流动动画
  clearMaterialFlows() {
    this.materialFlows.clear();
  }
}

// 创建全局动画管理器实例
export const globalAnimationManager = new GlobalAnimationManager();

// 处理模型动画的通用函数
function handleModelAnimations(gltf, model) {
  if (gltf.animations && gltf.animations.length > 0) {
    const mixer = new THREE.AnimationMixer(model);

    // 将所有动画添加到mixer并自动播放
    gltf.animations.forEach((clip) => {
      const action = mixer.clipAction(clip);
      action.setLoop(THREE.LoopRepeat);
      action.clampWhenFinished = true;
      action.play(); // 自动播放所有动画
    });

    // 将mixer添加到全局动画管理器
    globalAnimationManager.addMixer(model, mixer);

    // 启动全局动画播放
    globalAnimationManager.play();

    console.log(
      `✅ 模型 ${model.name || "unnamed"} 的 ${
        gltf.animations.length
      } 个动画已自动播放`
    );
  }

  // 处理材质流动动画
  handleMaterialFlowAnimation(model);
}

// 处理材质流动动画
function handleMaterialFlowAnimation(model) {
  const speedX = -0.0048; // 流动速度，可以根据需要调整

  model.traverse((child) => {
    if (child.isMesh && child.name && child.name.includes("move")) {
      // 检查材质
      if (child.material) {
        if (Array.isArray(child.material)) {
          // 处理材质数组
          child.material.forEach((material) => {
            if (material.map) {
              // 确保材质有map属性
              if (!material.userData.originalOffset) {
                material.userData.originalOffset = {
                  x: material.map.offset.x,
                  y: material.map.offset.y,
                };
              }
              // 添加到全局动画管理器的材质流动列表
              globalAnimationManager.addMaterialFlow(material, speedX);
            }
          });
        } else {
          // 处理单个材质
          if (child.material.map) {
            // 确保材质有map属性
            if (!child.material.userData.originalOffset) {
              child.material.userData.originalOffset = {
                x: child.material.map.offset.x,
                y: child.material.map.offset.y,
              };
            }
            // 添加到全局动画管理器的材质流动列表
            globalAnimationManager.addMaterialFlow(child.material, speedX);
          }
        }

        console.log(`✅ 为包含"move"的mesh "${child.name}" 添加材质流动动画`);
      }
    }
  });
}

/**
 * @param {{name:string,path:string,type:string}[]} models 模型路径或者数组
 * @param {(gltf:import("three/examples/jsm/loaders/GLTFLoader").GLTF,path:string)=>{}} onProgress 模型加载回调
 * @param {()=>void} onLoaded
 * @returns {Promise}
 */
export async function loadGLTF(models, onProgress, onLoaded) {
  // 确保 MeshoptDecoder 已初始化
  try {
    await MeshoptDecoder.ready;
  } catch (error) {
    console.warn("⚠️ MeshoptDecoder 初始化失败，但继续加载模型:", error);
  }

  const promises = [];
  loadingInstance.service(0);
  postOnLoading();
  if (Array.isArray(models)) {
    models.forEach((model) => {
      if (model.type !== ".glb" && model.type !== ".gltf") return;
      const promise = loader.loadAsync(model.path).then((gltf) => {
        // 统一处理动画
        handleModelAnimations(gltf, gltf.scene);
        onProgress(gltf, model.name);
      });
      promises.push(promise);
    });
  } else {
    if (models.type !== ".glb" && models.type !== ".gltf") return;
    const promise = loader.loadAsync(models.path).then((gltf) => {
      // 统一处理动画
      handleModelAnimations(gltf, gltf.scene);
      onProgress(gltf, models.name);
    });
    promises.push(promise);
  }

  return Promise.all(promises).then(() => {
    onLoaded && onLoaded();
  });
}

/**
 * @param {{name:string,path:string,type:string}[]} models 模型路径或者数组
 * @param {{name: string;vertices: Vector3[];}[]} onProgress 模型加载回调
 * @returns {Promise}
 */
export function loadOBJ(models, onProgress) {
  const loader = new GbkOBJLoader();
  const promises = [];

  models.forEach((model) => {
    if (model.type !== ".obj") return;
    /**@type {Promise<{name: string;vertices: Vector3[];}[]} */
    const promise = loader
      .loadAsync(model.path)
      .then((object) => onProgress(object, model.name));
    promises.push(promise);
  });
  return Promise.all(promises);
}
