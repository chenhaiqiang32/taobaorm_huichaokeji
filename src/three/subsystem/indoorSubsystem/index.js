import * as THREE from "three";
import * as TWEEN from "three/examples/jsm/libs/tween.module";
import { RGBELoader } from "three/examples/jsm/loaders/RGBELoader.js";
import { CustomSystem } from "../customSystem";
import { loadGLTF } from "@/three/loader";
import { getBoxCenter } from "../../../lib/box3Fun";
import { lightIndexUpdate, lightIndexReset } from "../../../shader/funs";
import { createCSS2DObject } from "../../../lib/CSSObject";

import { changeIndoor, web3dSelectCode } from "../../../message/postMessage";
import EquipmentPlate from "../../components/business/equipMentPlate";
import { SunnyTexture } from "../../components/weather";
import { SpecialGround } from "../../../lib/blMeshes";
import BoxModel from "../../../lib/boxModel";
import { dynamicFade, fadeByTime } from "../../../shader";
import { SceneHint } from "../../components/SceneHint";
import { equipmentTreeManager } from "./equipmentTreeManager";

let rightMouseupTime = 0;

/**@type {OrbitControls} */
const controlsParameters = {
  maxPolarAngle: Math.PI / 2.05,
};

/**@classdesc 定位子系统，包含场景，子系统特有的功能，用于主系统和子系统的切换（包含主场景和子场景切换） */
export class IndoorSubsystem extends CustomSystem {
  constructor(core) {
    super(core);
    this.gatherOrSilentData = {};
    this.gatherOrSilentLabel = null; // 预警牌子

    // 为子系统的子场景添加独一无二的灯光，背景图
    this.scene.background = SunnyTexture;
    this.onRenderQueue = core.onRenderQueue;
    this.controls = core.controls;

    this.camera = core.camera;
    this.tweenControl = core.tweenControl;
    this.orientation = core.orientation;

    this.buildingObject = {}; // 储存每一层楼的group
    this.currentFloor = null; // 当前楼层
    this.eventClear = [];

    // 建筑
    this.building = null;
    this.buildingName = null;

    this.endChangeFloor = true; // 楼层切换结束

    // 保存用于射线检测的楼层引用，定位
    this.floors = [];

    // 设备标签数据存储（按楼层存储）
    this.deviceLabelsData = {};

    // 初始化场景提示
    this.sceneHint = new SceneHint();
    console.log("this.sceneHint", this);
  }

  async onEnter(buildingName) {
    // 注意：clearIndoorData 现在在 changeSystemCommon 中处理，避免重复清理

    if (this.core.ground && this.core.ground.hideAllBuildingLabel) {
      this.core.ground.hideAllBuildingLabel();
    }

    // 设置室内相机控制参数
    this.handleControls();

    this.currentPoint = null;
    EquipmentPlate.onLoad(this, this.core);

    if (!this.sceneHint) {
      this.sceneHint = new SceneHint();
    }

    this.sceneHint.show("右键双击返回室外");

    this.setIndoorHDRSky();

    // 按需加载设备树数据
    try {
      console.log(`开始按需加载建筑 ${buildingName} 的设备树数据...`);
      await equipmentTreeManager.getEquipmentTree(buildingName);
      console.log(`建筑 ${buildingName} 设备树数据加载完成`);
    } catch (error) {
      console.error(`加载建筑 ${buildingName} 设备树数据失败:`, error);
    }

    let obj = {
      name: buildingName,
      path: `./models/inDoor/${buildingName}.glb`,
      type: ".glb",
    };
    this.buildingName = buildingName;
    return loadGLTF(
      [obj],
      this.onProgress.bind(this),
      this.onLoaded.bind(this)
    );
  }

  createGround(center, min) {
    // 获取建筑的包围盒
    let boundingBox = null;
    if (this.building) {
      boundingBox = new THREE.Box3().setFromObject(this.building);
    }

    const ground = new SpecialGround(center, min, boundingBox);

    // 设置地面接收阴影
    ground.receiveShadow = true;
    ground.castShadow = false; // 地面通常不投射阴影

    // 保存地面引用以便在渲染循环中更新
    this.ground = ground;

    // 设置地面材质的环境贴图
    if (this.scene.environment && ground.material) {
      this.setupIndoorMaterial(ground.material);
    }

    this.scene.add(ground);
  }

  /**
   * 创建BoxModel地面
   */
  createBoxModelGround(center, radius) {
    // 移除现有的BoxModel地面
    if (this.boxModelGround) {
      this.boxModelGround.dispose();
      this.boxModelGround = null;
    }

    // 创建新的BoxModel地面
    this.boxModelGround = new BoxModel(this.core);
    this.boxModelGround.initModel(center, radius);
  }

  /**
   * 重新创建地面 - 根据当前模型重新计算地面范围
   */
  recreateGround() {
    // 移除现有地面
    if (this.ground) {
      this.scene.remove(this.ground);
      if (this.ground.geometry) {
        this.ground.geometry.dispose();
      }
      if (this.ground.material) {
        this.ground.material.dispose();
      }
      this.ground = null;
    }

    // 重新计算模型参数
    const param = getBoxCenter(this.building);

    // 创建新的地面 - 使用BoxModel
    this.createBoxModelGround(param.center, param.radius);

    console.log(
      "BoxModel地面已重新创建，新尺寸基于当前模型:",
      this.building.name
    );
  }

  handleControls() {
    Reflect.ownKeys(controlsParameters).forEach((key) => {
      this.controls.data = this.controls.data || {};
      this.controls.data[key] = this.controls[key];
      this.controls[key] = controlsParameters[key];
    });
  }

  resetControls() {
    Reflect.ownKeys(controlsParameters).forEach((key) => {
      if (this.controls.data && this.controls.data[key] !== undefined) {
        this.controls[key] = this.controls.data[key];
      }
    });
  }

  async onChangeSystemCustom(state, floorName, buildingName) {
    if (state === "outToIn") {
      await this.onEnter(buildingName);
      this.changeFloor(floorName);
    }
    if (state === "inToInSingle") {
      this.changeFloor(floorName);
    }
    if (state === "inToInOther") {
      this.clearIndoorData();
      await this.onEnter(buildingName);
      this.changeFloor(floorName);
    }
  }
  onProgress(gltf, name) {
    const building = gltf.scene;
    let group = building.children.find((child) => child.name === "equip");
    this.building = group;
    const obj = { group, uTime: { value: 1.0 } };
    group.traverse((child) => {
      if (child.isMesh) {
        this.modelProcessing(child, obj);
        child.userData.parent = group.name;
      }
    });

    if (group.name.indexOf("BDW") === -1) {
      this.floors.push(group);
    }
    this.buildingObject[group.name] = obj;
    this.scene.add(building);
  }
  modelProcessing(child, obj) {
    // 设置阴影属性
    child.castShadow = true;
    child.receiveShadow = true;

    if (child.material.transparent) {
      child.renderOrder = 3;
      child.material.depthWrite = true;
    }

    // 改进材质克隆逻辑，避免累积过多纹理
    const originalMaterial = child.material;
    child.material = originalMaterial.clone();

    // 确保新材质有正确的纹理引用
    const textureProperties = [
      "map",
      "normalMap",
      "emissiveMap",
      "specularMap",
      "roughnessMap",
      "metalnessMap",
      "alphaMap",
      "envMap",
      "lightMap",
      "aoMap",
      "displacementMap",
      "bumpMap",
    ];

    textureProperties.forEach((prop) => {
      if (originalMaterial[prop]) {
        child.material[prop] = originalMaterial[prop];
      }
    });

    child.material.transparent = true;
    child.material.metalness = 0.2;
    child.material.roughness = 0.8;

    this.setupIndoorMaterial(child.material);

    if (
      !child.name.includes("BDW") &&
      child.material.name.includes("建筑外壳")
    ) {
      dynamicFade(child.material, obj.uTime, new THREE.Color("#3acacc"));

      child.renderOrder = 2;
    } else {
      fadeByTime(child.material, obj.uTime);
    }
  }

  onLoaded() {
    // 重新计算地面范围
    this.recreateGround();
    this.createAndSetupLights(this.building);

    if (this.scene.environment) {
      this.processIndoorEnvMapMaterials();
    }

    // 设置渲染队列，确保地面着色器能够更新
    if (this.core && this.core.onRenderQueue) {
      this.core.onRenderQueue.set("indoorSubsystem", this.update.bind(this));
    }

    this.cameraMove(this.building);
    this.addEventListener();
    this.changeFloor("equip");
  }
  cameraMove(group) {
    return new Promise((res, rej) => {
      let position, target;
      const { center, radius } = getBoxCenter(group);
      target = center;
      position = new THREE.Vector3();
      const _distance = this.camera.position.distanceTo(center);
      const alpha = (_distance - Math.sqrt(radius) * 2) / _distance;
      position.lerpVectors(this.camera.position, center, alpha);

      this.tweenControl.changeTo({
        start: this.camera.position,
        end: position,
        duration: 1000,
        onComplete: () => {
          this.controls.enable = true;
          res();
        },
        onStart: () => {
          this.controls.enable = false;
        },
      });

      this.tweenControl.changeTo({
        start: this.controls.target,
        end: target,
        duration: 1000,
        onUpdate: () => {
          this.controls.update();
        },
      });
    });
  }

  cameraMoveToFloor(group) {
    return new Promise((res, rej) => {
      const { center, radius, min, max } = getBoxCenter(group);

      const floorHeight = max.y - min.y;
      const target = center.clone();

      const cameraDistance = Math.max(floorHeight * 1.5, radius * 2);
      const position = new THREE.Vector3(
        center.x,
        center.y + floorHeight + cameraDistance * 0.8,
        center.z + cameraDistance * 1.2
      );

      this.tweenControl.changeTo({
        start: this.camera.position,
        end: position,
        duration: 1200,
        onComplete: () => {
          this.controls.enable = true;
          res();
        },
        onStart: () => {
          this.controls.enable = false;
        },
      });

      this.tweenControl.changeTo({
        start: this.controls.target,
        end: target,
        duration: 1200,
        onUpdate: () => {
          this.controls.update();
        },
      });
    });
  }

  onLeave() {
    if (this.core.ground && this.core.ground.showAllBuildingLabel) {
      this.core.ground.showAllBuildingLabel();
    }
    this.resetControls();

    if (this.sceneHint) {
      this.sceneHint.hide();
    }

    // 清理渲染队列
    if (this.core && this.core.onRenderQueue) {
      this.core.onRenderQueue.delete("indoorSubsystem");
    }

    // 执行完整的清理操作
    this.clearIndoorData();

    console.log("室内系统 onLeave 完成");
  }
  addEventListener() {
    this.addRayDbClick();
    this.addRayMove();
    this.addRightDbClickQuit();
  }
  addRayDbClick() {
    let event = this.core.raycast("dblclick", this.floors, (intersects) => {
      if (intersects.length) {
        let target = intersects[0].object.userData.parent;
        this.changeFloor(target);
      }
    });
    this.eventClear.push(event.clear);
    return event.clear;
  }
  disposeGatherOrSilent() {
    let toDelete = [];
    for (let key in this.gatherOrSilentData) {
      toDelete.push(key);
    }
    toDelete.forEach((key) => {
      delete this.gatherOrSilentData[key];
    });
    this.gatherOrSilentData = {};
    this.disPoseGatherShader();
  }
  changeFloor(floor) {
    if (!this.buildingObject || !this.buildingObject[floor]) {
      console.warn(`楼层 "${floor}" 的建筑数据尚未加载完成，请稍后再试`);
      return false;
    }

    if (!this.endChangeFloor) return false;
    this.resetData();

    // 清理当前楼层的设备标签
    this.clearDeviceLabels();
    if (!this.currentFloor) {
      this.endChangeFloor = false;
      this.removeEventListener();
      this.addPointerLister();
      this.addIndoorEvent();
      // !this.core.isFollowing() ? this.addRightDbClickReset() : null;
      !this.core.isFollowing() ? this.addRightDbClickQuit() : null;
      this.switchFloorAnimate(floor).then((res) => {
        if (
          window.configs.floorToName[this.buildingName + "_室内"] &&
          window.configs.floorToName[this.buildingName + "_室内"][floor]
        ) {
          changeIndoor(
            window.configs.floorToName[this.buildingName + "_室内"][floor]
          );
        }
        super.updateOrientation();
        this.core.crossSearch.changeSceneSearch();
        this.endChangeFloor = true;
        this.gatherOrSilentShader();

        // 在楼层切换动画完成后加载设备标签数据
        this.loadAndRenderDeviceLabels();

        // if (this.sceneHint) {
        //   this.sceneHint.updateMessage("右键双击显示楼栋");
        // }
      });
      this.buildingAnimate(floor);
    }
    if (
      this.currentFloor &&
      this.currentFloor.name === floor &&
      this.endChangeFloor
    )
      return;

    // this.floorSwitchInner(floor);

    // 拆分后的事件注册
    this.setupFloorRaycastEvents(floor);
  }
  gatherOrSilentShader() {
    this.disPoseGatherShader();
    if (this.gatherOrSilentData[this.currentFloor.name]) {
      const { id, type, areaType, areaDataOut, areaDataBuilding, areaName } =
        this.gatherOrSilentData[this.currentFloor.name];
      this.gatherOrSilentLabel =
        this.core.ground.gatherOrSilentPlate.gatherModel(
          this.currentFloor,
          type,
          areaName
        );
      this.scene.add(this.gatherOrSilentLabel);
    }
  }
  disPoseGatherShader() {
    if (this.gatherOrSilentLabel) {
      this.core.ground.gatherOrSilentPlate.clearGeometryGather(
        this.currentFloor
      );
      this.gatherOrSilentLabel.deleteSelf();
      this.gatherOrSilentLabel = null;
    }
  }
  addIndoorEvent() {
    let cancel = this.core.addClickCustom(this.indoorClickEvent.bind(this));
    this.eventClear.push(cancel);
  }
  indoorClickEvent(ray) {
    let personInserts = ray.intersectObject(
      this.orientation.orientation3D.singleGroup
    );
    const personInsertsVisible = personInserts.filter(
      (intersect) => intersect.object.visible
    );
    if (personInsertsVisible.length) {
      this.core.clearSearch();
      const object = personInsertsVisible[0].object;
      this.orientation.setSearchId(object.name);
      this.orientation.search();
      this.orientation.personSearchModule.setPosition();
      return;
    }
    let equipInserts = ray.intersectObject(EquipmentPlate.equipGroup);
    const equipInsertsVisible = equipInserts.filter(
      (intersect) => intersect.object.visible
    );
    if (equipInsertsVisible.length) {
      this.core.clearSearch();
      let typeName = equipInsertsVisible[0].object.typeName;
      let id = equipInsertsVisible[0].object.name;
      EquipmentPlate.searchEquip(id, typeName);
      return;
    }
  }
  addPointerLister() {
    let mousemovePointer = this.core.raycast(
      "mousemove",
      this.orientation.orientation3D.pointerArr,
      (intersects) => {
        if (intersects.length) {
          document.body.style.cursor = "pointer";
        } else {
          document.body.style.cursor = "auto";
        }
      }
    );
    this.eventClear.push(mousemovePointer.clear);
  }
  addRayMove() {
    let event = this.core.raycast("mousemove", this.floors, (intersects) => {
      if (intersects.length) {
        let target = intersects[0].object.userData.parent;
        if (this.currentPoint === target) return;
        this.currentPoint = target;
        document.body.style.cursor = "pointer";
        this.core.postprocessing.clearOutlineAll(1);
        this.core.postprocessing.addOutline(
          this.buildingObject[target].group,
          1
        );
      } else {
        if (!this.currentPoint) return;
        this.resetEffect();
      }
    });

    this.eventClear.push(event.clear);
    return event.clear;
  }
  addRightDbClickReset() {
    const del = this.rightDblClickListener(() => {
      this.removeEventListener();
      this.cameraMove(this.building);
      this.addEventListener();
      this.resetBuilding();
      this.disPoseGatherShader();
    });
    this.eventClear.push(del);
  }
  setFloorGatherOrSilent(param) {
    this.gatherOrSilentData[param.areaDataFloor] = param;
  }
  addRightDbClickQuit() {
    const del = this.rightDblClickListener(() => {
      this.core.changeSystem("ground");
    });
    this.eventClear.push(del);
  }
  rightDblClickListener(fn) {
    const rightDblClick = this.core.addEventListener("mouseup");
    const del = rightDblClick.add((e) => {
      if (e.button !== 2) return;
      let timeStamp = new Date().getTime();
      if (timeStamp - rightMouseupTime < 250) {
        fn(e);
        timeStamp = 0;
      }
      rightMouseupTime = timeStamp;
    });
    return del;
  }
  switchFloorAnimate(target) {
    if (
      !this.buildingObject ||
      !this.buildingObject[target] ||
      !this.buildingObject[target].group
    ) {
      console.error(`楼层 "${target}" 的建筑数据不完整，无法执行楼层切换动画`);
      return Promise.reject(new Error(`楼层 "${target}" 的建筑数据不完整`));
    }

    const group = this.buildingObject[target].group;

    const { min, max } = getBoxCenter(group);
    return new Promise((res, rej) => {
      lightIndexUpdate(max.y, min.y);

      this.currentFloor = group;
      this.cameraMoveToFloor(group).then(() => {
        res({ sceneType: 0, originId: target });
      });
    });
  }
  // 楼层内部之间切换
  floorSwitchInner(target) {
    if (
      !this.buildingObject ||
      !this.buildingObject[target] ||
      !this.buildingObject[target].group
    ) {
      console.error(`楼层 "${target}" 的建筑数据不完整，无法执行楼层内部切换`);
      return;
    }

    this.endChangeFloor = false;
    const group = this.buildingObject[target].group;
    const { min, max } = getBoxCenter(group);
    lightIndexReset();
    lightIndexUpdate(max.y, min.y);

    let lastFloor = this.currentFloor.name;
    this.buildingObject[lastFloor].uTime.value = 0.2;
    this.buildingObject[target].group.visible = true;
    this.buildingObject[target].uTime.value = 1;
    new TWEEN.Tween(this.buildingObject[lastFloor].uTime)
      .to({ value: 0.0 }, 1000)
      .start()
      .onComplete(() => {
        this.buildingObject[lastFloor].group.visible = false;
      });
    this.currentFloor = group;
    this.cameraMoveToFloor(group).then(() => {
      super.updateOrientation();
      this.core.crossSearch.changeSceneSearch();
      this.endChangeFloor = true;

      // 在楼层内部切换完成后加载设备标签数据
      this.loadAndRenderDeviceLabels();
    });
  }
  resetEffect() {
    this.currentPoint = null;
    document.body.style.cursor = "auto";
    this.core.postprocessing.clearOutlineAll(1);
  }
  buildingAnimate(target) {
    return new Promise((res, rej) => {
      Reflect.ownKeys(this.buildingObject).forEach((key) => {
        if (key === target) {
        } else {
          const t = new TWEEN.Tween(this.buildingObject[key].uTime)
            .to({ value: 0.0 }, 1000)
            .start()
            .onComplete(() => {
              this.buildingObject[key].group.visible = false;
              res();
            });
        }
      });
    });
  }
  resetBuilding() {
    lightIndexUpdate();
    Reflect.ownKeys(this.buildingObject).forEach((key) => {
      this.buildingObject[key].group.visible = true;
      const t = new TWEEN.Tween(this.buildingObject[key].uTime)
        .to({ value: 1 }, 1000)
        .start()
        .onComplete(() => {
          this.currentFloor = null;
          this.resetData();
        });
    });
    if (this.sceneHint) {
      this.sceneHint.updateMessage("右键双击返回室外");
    }
  }
  resetData() {
    this.orientation.orientation3D.disposeClusterGroup();
    EquipmentPlate.disposeAll();
  }

  removeEventListener() {
    this.clearFloorRaycastEvents();
    this.eventClear.forEach((clear) => clear());
    this.eventClear = [];
    this.resetEffect();
  }
  dispose() {
    console.log("开始 dispose 室内系统...");

    this.currentFloor = null;

    // 彻底清理建筑对象和材质
    if (this.buildingObject) {
      Object.values(this.buildingObject).forEach((obj) => {
        if (obj.group) {
          // 遍历所有网格并清理材质
          obj.group.traverse((child) => {
            if (child.isMesh && child.material) {
              // 清理材质
              if (Array.isArray(child.material)) {
                child.material.forEach((material) => {
                  this.disposeMaterial(material);
                });
              } else {
                this.disposeMaterial(material);
              }
              child.material = null;
            }
            // 清理几何体
            if (child.geometry) {
              child.geometry.dispose();
            }
          });
          // 从场景中移除
          this.scene.remove(obj.group);
        }
      });
      this.buildingObject = {};
    }

    this.removeEventListener();
    this.resetData();
    this.scene.dispose();
    lightIndexUpdate();

    // 清理设备牌子
    this.clearDeviceLabelsAndInstance();

    // 清理BoxModel地面
    if (this.boxModelGround) {
      this.boxModelGround.dispose();
      this.boxModelGround = null;
    }

    if (this.sceneHint) {
      this.sceneHint.destroy();
      this.sceneHint = null;
    }

    this.removeLightHelpers();

    // 强制垃圾回收提示
    if (window.gc) {
      window.gc();
    }

    // 监控WebGL资源使用情况
    if (this.core && this.core.logWebGLResources) {
      console.log("dispose后的WebGL资源使用情况:");
      this.core.logWebGLResources();
    }

    // 清理纹理管理器
    if (this.core && this.core.textureManager) {
      this.core.textureManager.clearAll();
    }

    console.log("室内系统 dispose 完成");
  }

  /**
   * 添加灯光辅助器（用于调试）
   */
  addLightHelpers() {
    this.removeLightHelpers();

    this.mainLightHelper = new THREE.DirectionalLightHelper(
      this.lights.main,
      5
    );
    this.scene.add(this.mainLightHelper);

    this.auxiliaryLightHelper = new THREE.DirectionalLightHelper(
      this.lights.auxiliary,
      3
    );
    this.scene.add(this.auxiliaryLightHelper);

    this.shadowCameraHelper = new THREE.CameraHelper(
      this.lights.main.shadow.camera
    );
    this.scene.add(this.shadowCameraHelper);
  }

  /**
   * 移除灯光辅助器
   */
  removeLightHelpers() {
    if (this.mainLightHelper) {
      this.scene.remove(this.mainLightHelper);
      this.mainLightHelper.dispose();
      this.mainLightHelper = null;
    }

    if (this.auxiliaryLightHelper) {
      this.scene.remove(this.auxiliaryLightHelper);
      this.auxiliaryLightHelper.dispose();
      this.auxiliaryLightHelper = null;
    }

    if (this.shadowCameraHelper) {
      this.scene.remove(this.shadowCameraHelper);
      this.shadowCameraHelper.dispose();
      this.shadowCameraHelper = null;
    }
  }

  /**
   * 设置室内金色HDR环境贴图和天空
   */
  setIndoorHDRSky() {
    const loader = new RGBELoader();
    loader.setDataType(THREE.FloatType);

    loader.load(
      "./bg.hdr",
      (texture) => {
        texture.mapping = THREE.EquirectangularReflectionMapping;
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.exposure = 1.5;

        this.scene.background = texture;

        const envTexture = texture.clone();
        envTexture.intensity = 1.2;
        this.scene.environment = envTexture;

        this.processIndoorEnvMapMaterials();
      },

      (error) => {
        console.error("室内HDR加载失败:", error);
        this.setFallbackIndoorHDR();
      }
    );
  }

  /**
   * 备用HDR方案
   */
  setFallbackIndoorHDR() {
    const loader = new RGBELoader();
    loader.setDataType(THREE.FloatType);

    loader.load(
      "./bg.hdr",
      (texture) => {
        texture.mapping = THREE.EquirectangularReflectionMapping;
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.exposure = 1.8;

        this.scene.background = texture;

        const envTexture = texture.clone();
        envTexture.intensity = 1.0;
        this.scene.environment = envTexture;

        this.processIndoorEnvMapMaterials();
      },

      (error) => {
        console.error("备用HDR也加载失败:", error);
        this.setDefaultIndoorSky();
      }
    );
  }

  /**
   * 默认室内天空方案
   */
  setDefaultIndoorSky() {
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 512;
    const context = canvas.getContext("2d");

    const gradient = context.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, "#FFD700");
    gradient.addColorStop(0.3, "#FFA500");
    gradient.addColorStop(0.7, "#FF8C00");
    gradient.addColorStop(1, "#FF4500");

    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);

    const texture = new THREE.CanvasTexture(canvas);
    texture.mapping = THREE.EquirectangularReflectionMapping;
    texture.colorSpace = THREE.SRGBColorSpace;

    this.scene.background = texture;

    const envTexture = texture.clone();
    envTexture.intensity = 0.8;
    this.scene.environment = envTexture;
  }

  /**
   * 处理室内环境贴图材质
   */
  processIndoorEnvMapMaterials() {
    this.scene.traverse((object) => {
      if (object.isMesh && object.material) {
        if (Array.isArray(object.material)) {
          object.material.forEach((material) => {
            this.setupIndoorMaterial(material);
          });
        } else {
          this.setupIndoorMaterial(object.material);
        }
      }
    });
  }

  /**
   * 设置室内材质的环境贴图
   */
  setupIndoorMaterial(material) {
    if (material.isMeshStandardMaterial || material.isMeshPhysicalMaterial) {
      if (this.scene.environment) {
        material.envMap = this.scene.environment;
        material.envMapIntensity = 3.2;
      } else {
        material.envMapIntensity = 0;
      }
      material.needsUpdate = true;
    }
  }

  /**
   * 清理室内HDR环境贴图
   */
  clearIndoorHDR() {
    if (this.scene.background) {
      this.scene.background.dispose();
      this.scene.background = null;
    }

    if (this.scene.environment) {
      this.scene.environment.dispose();
      this.scene.environment = null;
    }

    this.scene.traverse((object) => {
      if (object.isMesh && object.material) {
        if (Array.isArray(object.material)) {
          object.material.forEach((material) => {
            if (material.envMap) {
              material.envMap = null;
              material.envMapIntensity = 0;
              material.needsUpdate = true;
            }
          });
        } else {
          if (object.material.envMap) {
            object.material.envMap = null;
            object.material.envMapIntensity = 0;
            object.material.needsUpdate = true;
          }
        }
      }
    });
  }

  /**
   * 子系统执行在动画帧中函数
   */
  update() {
    // 更新地面着色器时间
    if (this.ground && this.ground.update) {
      this.ground.update(this.core);
    }

    // 更新BoxModel地面
    if (this.boxModelGround) {
      this.boxModelGround.update(this.core.elapsedTime);
    }
  }

  /**
   * 清理室内系统数据（用于室内切换时的清理）
   */
  clearIndoorData() {
    console.log("开始清理室内系统数据...");

    this.removeEventListener();
    this.resetData();
    this.disposeGatherOrSilent();

    // 清理设备牌子
    this.clearDeviceLabelsAndInstance();

    if (this.sceneHint) {
      this.sceneHint.hide();
    }

    // 清理地面
    if (this.ground) {
      this.scene.remove(this.ground);
      if (this.ground.geometry) {
        this.ground.geometry.dispose();
      }
      if (this.ground.material) {
        this.ground.material.dispose();
      }
      this.ground = null;
    }

    // 清理BoxModel地面
    if (this.boxModelGround) {
      this.boxModelGround.dispose();
      this.boxModelGround = null;
    }

    // 彻底清理建筑对象和材质
    if (this.buildingObject) {
      Object.values(this.buildingObject).forEach((obj) => {
        if (obj.group) {
          // 遍历所有网格并清理材质
          obj.group.traverse((child) => {
            if (child.isMesh && child.material) {
              // 清理材质
              if (Array.isArray(child.material)) {
                child.material.forEach((material) => {
                  this.disposeMaterial(material);
                });
              } else {
                this.disposeMaterial(child.material);
              }
              child.material = null;
            }
            // 清理几何体
            if (child.geometry) {
              child.geometry.dispose();
            }
          });
          // 从场景中移除
          this.scene.remove(obj.group);
        }
      });
      this.buildingObject = {};
    }

    if (this.building && this.building.parent) {
      this.building.parent.remove(this.building);
      this.building = null;
    }

    this.buildingObject = {};
    this.floors = [];
    this.currentFloor = null;
    this.endChangeFloor = true;

    this.resetControls();
    this.clearIndoorHDR();
    this.removeIndoorLights();

    // 强制垃圾回收提示
    if (window.gc) {
      window.gc();
    }

    // 监控WebGL资源使用情况
    if (this.core && this.core.logWebGLResources) {
      console.log("清理后的WebGL资源使用情况:");
      this.core.logWebGLResources();
    }

    // 清理纹理管理器
    if (this.core && this.core.textureManager) {
      this.core.textureManager.clearAll();
    }

    console.log("室内系统数据清理完成");
  }

  /**
   * 彻底清理材质及其纹理
   * @param {THREE.Material} material 要清理的材质
   */
  disposeMaterial(material) {
    if (!material) return;

    // 清理材质的所有纹理
    const textureProperties = [
      "map",
      "normalMap",
      "emissiveMap",
      "specularMap",
      "roughnessMap",
      "metalnessMap",
      "alphaMap",
      "envMap",
      "lightMap",
      "aoMap",
      "displacementMap",
      "bumpMap",
    ];

    textureProperties.forEach((prop) => {
      if (material[prop]) {
        // 使用纹理管理器清理纹理
        if (this.core && this.core.textureManager) {
          const textureKey = `${material.name || "unknown"}_${prop}`;
          this.core.textureManager.removeTexture(textureKey);
        } else {
          // 备用方案：直接清理
          material[prop].dispose();
        }
        material[prop] = null;
      }
    });

    // 清理材质本身
    material.dispose();
  }

  /**
   * 根据建筑包围盒创建和设置灯光
   * @param {THREE.Object3D} building - 建筑对象
   */
  createAndSetupLights(building) {
    if (!building) {
      console.warn("建筑对象未提供，无法创建和设置灯光");
      return;
    }

    // 先清理现有的灯光
    this.removeIndoorLights();

    const box = new THREE.Box3().setFromObject(building);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const min = box.min;
    const max = box.max;

    const buildingWidth = size.x;
    const buildingHeight = size.y;
    const buildingDepth = size.z;
    const maxDimension = Math.max(buildingWidth, buildingHeight, buildingDepth);

    // 创建环境光
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    this.ambientLight = ambientLight;
    this._add(this.ambientLight);

    // 创建方向光，位置设置在包围盒最高点上方
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);

    // 设置方向光位置在包围盒最高点上方
    const lightHeight = max.y + maxDimension * 0.5; // 在最高点上方一定距离
    directionalLight.position.set(center.x, lightHeight, center.z);

    // 设置方向光朝向建筑中心，但稍微向下以覆盖地面
    const targetPosition = center.clone();
    targetPosition.y = min.y - 50; // 目标点稍微低于地面，确保覆盖地面
    directionalLight.target.position.copy(targetPosition);
    // this._add(directionalLight.target);

    // 配置方向光的阴影
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    directionalLight.shadow.camera.near = 0.1;
    directionalLight.shadow.camera.far = lightHeight * 2;

    // 设置阴影相机视锥体以覆盖整个建筑和地面
    const shadowSize = maxDimension * 2; // 增大阴影覆盖范围
    directionalLight.shadow.camera.left = -shadowSize;
    directionalLight.shadow.camera.right = shadowSize;
    directionalLight.shadow.camera.top = shadowSize;
    directionalLight.shadow.camera.bottom = -shadowSize;

    // 设置阴影偏移和模糊
    directionalLight.shadow.bias = -0.0001;
    directionalLight.shadow.normalBias = 0.02;
    directionalLight.shadow.radius = 1.5;

    this.directionLight = directionalLight;
    this._add(this.directionLight);

    // 将灯光存储到 lights 对象中，便于管理
    this.lights = {
      ambient: this.ambientLight,
      main: this.directionLight,
      auxiliary: null,
    };

    console.log("室内灯光创建完成");
  }

  /**
   * 移除室内灯光系统
   */
  removeIndoorLights() {
    this.removeLightHelpers();

    // 清理 this.lights 对象中的灯光
    if (this.lights) {
      if (this.lights.ambient) {
        this.scene.remove(this.lights.ambient);
        this.lights.ambient.dispose();
      }
      if (this.lights.main) {
        // 移除主方向光的目标点
        if (this.lights.main.target) {
          this.scene.remove(this.lights.main.target);
        }
        this.scene.remove(this.lights.main);
        this.lights.main.dispose();
      }
      if (this.lights.auxiliary) {
        // 移除辅助方向光的目标点
        if (this.lights.auxiliary.target) {
          this.scene.remove(this.lights.auxiliary.target);
        }
        this.scene.remove(this.lights.auxiliary);
        this.lights.auxiliary.dispose();
      }
      this.lights = null;
    }

    // 清理直接添加到场景中的灯光
    if (this.ambientLight) {
      this.scene.remove(this.ambientLight);
      this.ambientLight.dispose();
      this.ambientLight = null;
    }

    if (this.directionLight) {
      // 移除方向光的目标点
      if (this.directionLight.target) {
        this.scene.remove(this.directionLight.target);
      }
      this.scene.remove(this.directionLight);
      this.directionLight.dispose();
      this.directionLight = null;
    }

    if (this.auxiliaryLight) {
      // 移除辅助光的目标点
      if (this.auxiliaryLight.target) {
        this.scene.remove(this.auxiliaryLight.target);
      }
      this.scene.remove(this.auxiliaryLight);
      this.auxiliaryLight.dispose();
      this.auxiliaryLight = null;
    }

    // 清理场景中所有剩余的灯光
    const lightsToRemove = [];
    this.scene.traverse((object) => {
      if (object.isLight) {
        lightsToRemove.push(object);
      }
    });

    lightsToRemove.forEach((light) => {
      console.log("清理场景中的灯光:", light.type, light.name || "unnamed");
      this.scene.remove(light);
      if (light.dispose) {
        light.dispose();
      }
    });

    console.log("室内灯光清理完成");
  }

  // 新增：清理楼层射线检测事件
  clearFloorRaycastEvents() {
    if (this._indoorRaycastClearFns) {
      this._indoorRaycastClearFns.forEach((fn) => fn());
      this._indoorRaycastClearFns = [];
    }
  }

  // 新增：注册楼层children射线检测与outline事件
  setupFloorRaycastEvents(floor) {
    this.clearFloorRaycastEvents();
    const children = this.buildingObject[floor].group.children;
    this._indoorRaycastClearFns = [];
    // 初始化时保存原始材质
    children.forEach((obj) => {
      obj.typeName = "device";
      obj.traverse((child) => {
        if (child instanceof THREE.Mesh && child.material) {
          // 保存原始材质到对象本身
          if (!child._originalMaterial) {
            child._originalMaterial = child.material.clone();
          }
        }
      });
    });
    // 鼠标移动高亮
    const moveEvt = this.core.raycast("mousemove", children, (intersects) => {
      if (intersects.length) {
        this.core.postprocessing.clearOutlineAll(1);
        this.core.postprocessing.addOutline(intersects[0].object, 1);
      } else {
        this.core.postprocessing.clearOutlineAll(1);
      }
    });
    this._indoorRaycastClearFns.push(moveEvt.clear);

    // 点击切换视角和蓝色轮廓
    const clickEvt = this.core.raycast("click", children, (intersects) => {
      if (intersects.length) {
        let targetObj = intersects[0].object;
        targetObj = this.getDeviceObject(targetObj);
        if (!targetObj) return;

        // 发送设备选择消息
        const deviceCode = targetObj.name.split("_")[0];
        web3dSelectCode(deviceCode);

        // 拉近视角到当前点击设备
        this.cameraMove(targetObj).then(() => {
          children.forEach((obj) => {
            if (obj === targetObj) {
              obj.traverse((child) => {
                if (child instanceof THREE.Mesh && child.material) {
                  // 选中对象恢复原始材质
                  if (child._originalMaterial) {
                    child.material = child._originalMaterial;
                  }
                  child.material.wireframe = false;
                  child.material.transparent = false;
                }
              });
            } else {
              // 其他设备变成蓝色材质
              obj.traverse((child) => {
                if (child instanceof THREE.Mesh && child.material) {
                  // 创建蓝色材质
                  const blueMaterial = new THREE.MeshBasicMaterial({
                    color: 0x0066ff,
                    transparent: true,
                    opacity: 0.8,
                    wireframe: true,
                  });
                  child.material = blueMaterial;
                }
              });
            }
          });
        });
      }
    });
    this._indoorRaycastClearFns.push(clickEvt.clear);

    // 右键双击恢复
    const rightEvt = this.rightDblClickListener(() => {
      // 只清除轮廓，不清除事件监听器
      this.core.postprocessing.clearOutlineAll(1);
      this.core.postprocessing.clearOutlineAll(2);
      // 恢复全部显示和原始材质
      children.forEach((obj) => {
        obj.traverse((child) => {
          if (child instanceof THREE.Mesh && child.material) {
            // 恢复原始材质
            if (child._originalMaterial) {
              child.material = child._originalMaterial;
            } else {
              // 如果没有保存原始材质，则重置为默认状态
              child.material.wireframe = false;
              child.material.transparent = false;
            }
            child.visible = true;
          }
        });
      });
      // 视角复位到切换楼层时的位置
      this.cameraMoveToFloor(this.buildingObject[floor].group).then(() => {
        // 设备恢复后，重新注册退出事件
        if (!this.core.isFollowing()) {
          this.addRightDbClickQuit();
        }
      });
    });
    this._indoorRaycastClearFns.push(rightEvt);
  }

  /**
   * 重置室内视角
   */
  resetCamera() {
    console.log("重置室内视角...");

    // 清除轮廓
    this.core.postprocessing.clearOutlineAll(1);
    this.core.postprocessing.clearOutlineAll(2);

    // 如果有当前楼层，恢复该楼层所有设备的显示和原始材质
    if (this.currentFloor && this.buildingObject[this.currentFloor.name]) {
      const children =
        this.buildingObject[this.currentFloor.name].group.children;

      // 恢复全部显示和原始材质
      children.forEach((obj) => {
        obj.traverse((child) => {
          if (child instanceof THREE.Mesh && child.material) {
            // 恢复原始材质
            if (child._originalMaterial) {
              child.material = child._originalMaterial;
            } else {
              // 如果没有保存原始材质，则重置为默认状态
              child.material.wireframe = false;
              child.material.transparent = false;
            }
            child.visible = true;
          }
        });
      });

      // 视角复位到切换楼层时的位置
      this.cameraMoveToFloor(
        this.buildingObject[this.currentFloor.name].group
      ).then(() => {
        console.log("室内视角重置完成");
      });
    } else {
      // 如果没有当前楼层，执行默认的相机移动
      if (this.building) {
        this.cameraMove(this.building).then(() => {
          console.log("室内视角重置完成（默认位置）");
        });
      }
    }
  }

  // 递归查找typeName为'device'的对象
  getDeviceObject(obj) {
    if (!obj) return null;
    if (obj.typeName === "device") return obj;
    return this.getDeviceObject(obj.parent);
  }

  /**
   * 保存设备标签数据到实例变量
   * @param {Array} deviceData - 设备数据数组
   */
  saveDeviceLabelsToInstance(deviceData) {
    if (!Array.isArray(deviceData)) {
      console.warn("设备数据格式错误，应为数组");
      return;
    }

    console.log("保存设备标签数据...");
    console.log("要保存的数据:", deviceData);

    // 按设备编号存储数据
    deviceData.forEach((device) => {
      const { code } = device;
      if (code) {
        this.deviceLabelsData[code] = device;
        console.log(`设备标签数据已保存到实例: ${code}`, device);
      } else {
        console.warn("设备数据缺少code字段:", device);
      }
    });

    console.log("当前所有存储的数据:", this.deviceLabelsData);
  }

  /**
   * 从实例变量读取设备标签数据
   * @returns {Array|null} 设备数据数组或null
   */
  loadDeviceLabelsFromInstance() {
    if (!this.currentFloor || !this.buildingObject[this.currentFloor.name]) {
      console.log("当前楼层或建筑数据不存在");
      return null;
    }

    const children = this.buildingObject[this.currentFloor.name].group.children;
    const availableDevices = [];
    const deviceData = [];

    // 遍历当前楼层的所有设备
    children.forEach((child) => {
      const deviceCode = child.name.split("_")[0];
      if (deviceCode && this.deviceLabelsData[deviceCode]) {
        availableDevices.push(deviceCode);
        deviceData.push(this.deviceLabelsData[deviceCode]);
      }
    });

    if (deviceData.length > 0) {
      console.log(
        `从实例读取设备标签数据，找到 ${deviceData.length} 个设备:`,
        availableDevices
      );
      console.log("设备数据:", deviceData);
      return deviceData;
    }

    console.log("当前楼层没有找到对应的设备标签数据");
    return null;
  }

  /**
   * 清除实例中的设备标签数据
   * @param {Array} deviceCodes - 要清除的设备编号数组，如果不传则清除所有数据
   */
  clearDeviceLabelsFromInstance(deviceCodes = null) {
    if (deviceCodes && Array.isArray(deviceCodes)) {
      // 清除指定的设备数据
      deviceCodes.forEach((code) => {
        if (this.deviceLabelsData[code]) {
          delete this.deviceLabelsData[code];
          console.log(`已清除设备标签数据: ${code}`);
        }
      });
    } else {
      // 清除所有数据
      this.deviceLabelsData = {};
      console.log("已清除所有设备标签数据");
    }
  }

  /**
   * 清除所有楼层的设备标签数据
   */
  clearAllDeviceLabelsData() {
    this.deviceLabelsData = {};
    console.log("已清除所有楼层的设备标签数据");
  }

  /**
   * 加载并渲染实例中的设备标签
   */
  loadAndRenderDeviceLabels() {
    // 等待一帧确保设备对象已加载完成
    requestAnimationFrame(() => {
      console.log("开始加载设备标签数据...");
      console.log(
        "当前楼层:",
        this.currentFloor ? this.currentFloor.name : "null"
      );
      console.log("存储的数据:", this.deviceLabelsData);

      const deviceData = this.loadDeviceLabelsFromInstance();
      if (deviceData && deviceData.length > 0) {
        console.log("自动加载实例中的设备标签数据");
        this.updateDeviceLabels(deviceData);
      } else {
        console.log("没有找到当前楼层的设备标签数据");
      }
    });
  }

  /**
   * 更新设备标签
   * @param {Array} deviceData - 设备数据数组
   */
  updateDeviceLabels(deviceData) {
    if (!Array.isArray(deviceData)) {
      console.warn("设备数据格式错误，应为数组");
      return;
    }

    console.log("开始更新设备标签...");
    console.log("新数据:", deviceData);

    // 清除现有的设备牌子
    this.clearDeviceLabels();

    // 清除实例中的所有设备标签数据
    this.clearDeviceLabelsFromInstance();

    // 保存新的数据到实例
    this.saveDeviceLabelsToInstance(deviceData);

    // 为每个设备创建新的牌子
    deviceData.forEach((device) => {
      this.createDeviceLabel(device);
    });

    console.log("设备标签更新完成");
  }

  /**
   * 清除所有设备牌子
   */
  clearDeviceLabels() {
    console.log("开始清除设备牌子...");
    console.log(
      "当前设备牌子数量:",
      this.deviceLabels ? this.deviceLabels.length : 0
    );

    if (this.deviceLabels && this.deviceLabels.length > 0) {
      this.deviceLabels.forEach((label, index) => {
        console.log(`清除第 ${index + 1} 个设备牌子:`, label.code);

        // 清除DOM元素
        if (label.element) {
          console.log(`移除DOM元素: ${label.code}`);
          label.element.remove();
          label.element = null;
        }

        // 清除CSS2D对象
        if (label.css2dObject) {
          console.log(`从场景移除CSS2D对象: ${label.code}`);

          // 确保从父对象中移除
          if (label.css2dObject.parent) {
            label.css2dObject.parent.remove(label.css2dObject);
          }

          // 从场景中移除
          this.scene.remove(label.css2dObject);

          // 清理CSS2D对象的引用
          label.css2dObject = null;
        }

        // 清理设备对象引用
        if (label.deviceObject) {
          label.deviceObject = null;
        }
      });

      // 清空数组
      this.deviceLabels = [];
      console.log("设备牌子数组已清空");
    } else {
      console.log("没有设备牌子需要清除");
    }

    // 强制清理场景中可能残留的CSS2D对象
    this.scene.traverse((object) => {
      if (object.name && object.name.startsWith("device-label-")) {
        console.log(`发现残留的CSS2D对象: ${object.name}，正在移除...`);
        this.scene.remove(object);
      }
    });

    // 清理CSS2D渲染器DOM元素中可能残留的设备标签
    const css2dRenderer = document.getElementById("css2dRenderer");
    if (css2dRenderer) {
      const deviceLabels = css2dRenderer.querySelectorAll(
        ".device-label-container"
      );
      console.log(
        `在CSS2D渲染器中发现 ${deviceLabels.length} 个残留的设备标签DOM元素`
      );
      deviceLabels.forEach((label, index) => {
        console.log(`移除残留的DOM元素 ${index + 1}:`, label);
        label.remove();
      });
    }

    console.log("设备牌子清除完成");
  }

  /**
   * 清除所有设备牌子并清除实例数据
   * @param {Array} deviceCodes - 要清除的设备编号数组，如果不传则清除所有数据
   */
  clearDeviceLabelsAndInstance(deviceCodes = null) {
    this.clearDeviceLabels();
    this.clearDeviceLabelsFromInstance(deviceCodes);
  }

  /**
   * 创建单个设备牌子
   * @param {Object} device - 设备数据
   */
  createDeviceLabel(device) {
    const { name, visible = true, code, configs = [] } = device;

    // 根据code查找对应的设备对象
    const deviceObject = this.findDeviceByCode(code);
    if (!deviceObject) {
      console.warn(`未找到设备编号为 ${code} 的设备`);
      return;
    }

    // 创建牌子容器
    const labelContainer = document.createElement("div");
    labelContainer.className = "device-label-container";

    // 创建牌子主体
    const labelMain = document.createElement("div");
    labelMain.className = "device-label-main";

    // 创建设备名称
    const nameElement = document.createElement("div");
    nameElement.className = "device-label-name";
    nameElement.textContent = name;
    labelMain.appendChild(nameElement);

    // 创建配置信息
    if (configs && configs.length > 0) {
      const configContainer = document.createElement("div");
      configContainer.className = "device-label-configs";

      configs.forEach((config) => {
        const configItem = document.createElement("div");
        configItem.className = "device-label-config-item";

        const keyElement = document.createElement("span");
        keyElement.className = "device-label-config-key";
        keyElement.textContent = config.key + ": ";

        const valueElement = document.createElement("span");
        valueElement.className = "device-label-config-value";
        valueElement.textContent = config.value;

        configItem.appendChild(keyElement);
        configItem.appendChild(valueElement);
        configContainer.appendChild(configItem);
      });

      labelMain.appendChild(configContainer);
    }

    // 创建装饰元素
    const labelTop = document.createElement("div");
    labelTop.className = "device-label-top";

    const labelBottom = document.createElement("div");
    labelBottom.className = "device-label-bottom";

    const labelBottomDown = document.createElement("div");
    labelBottomDown.className = "device-label-bottom-down";

    // 组装牌子
    labelContainer.appendChild(labelMain);
    labelContainer.appendChild(labelTop);
    labelContainer.appendChild(labelBottom);
    labelContainer.appendChild(labelBottomDown);

    // 创建CSS2D对象
    const css2dObject = createCSS2DObject(
      labelContainer,
      `device-label-${code}`
    );

    // 计算设备包围盒的最高点中间位置
    const boundingBox = new THREE.Box3().setFromObject(deviceObject);
    const devicePosition = new THREE.Vector3();

    // 获取包围盒的中心点
    boundingBox.getCenter(devicePosition);

    // 将Y坐标设置为包围盒的最高点
    devicePosition.y = boundingBox.max.y;

    // 在最高点上方添加一点偏移，避免标签与设备重叠
    // devicePosition.y += 0.5;

    // 调试信息：输出包围盒信息
    console.log(`设备 ${code} 包围盒信息:`, {
      min: boundingBox.min.toArray(),
      max: boundingBox.max.toArray(),
      center: devicePosition.toArray(),
      deviceName: deviceObject.name,
    });

    css2dObject.position.copy(devicePosition);

    // 设置可见性
    css2dObject.visible = visible;

    // 添加到场景
    this.scene.add(css2dObject);

    // 保存引用
    if (!this.deviceLabels) {
      this.deviceLabels = [];
    }
    this.deviceLabels.push({
      code,
      element: labelContainer,
      css2dObject,
      deviceObject,
    });
  }

  /**
   * 根据设备编号查找设备对象
   * @param {string} code - 设备编号
   * @returns {THREE.Object3D|null} 设备对象
   */
  findDeviceByCode(code) {
    if (!this.currentFloor || !this.buildingObject[this.currentFloor.name]) {
      return null;
    }

    const children = this.buildingObject[this.currentFloor.name].group.children;

    for (const child of children) {
      // 检查设备名称是否包含设备编号
      const deviceCode = child.name.split("_")[0];
      if (deviceCode === code) {
        return child;
      }
    }

    return null;
  }
}
