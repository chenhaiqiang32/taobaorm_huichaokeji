import * as THREE from "three";
import * as TWEEN from "three/examples/jsm/libs/tween.module";
import { RGBELoader } from "three/examples/jsm/loaders/RGBELoader.js";
import { CustomSystem } from "../customSystem";
import { loadGLTF } from "@/three/loader";
import { getBoxCenter } from "../../../lib/box3Fun";
import { lightIndexUpdate, lightIndexReset } from "../../../shader/funs";

import { changeIndoor } from "../../../message/postMessage";
import EquipmentPlate from "../../components/business/equipMentPlate";
import { SunnyTexture } from "../../components/weather";
import { SpecialGround } from "../../../lib/blMeshes";
import { dynamicFade, fadeByTime } from "../../../shader";
import { SceneHint } from "../../components/SceneHint";

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

    // 初始化场景提示
    this.sceneHint = new SceneHint();
    console.log("this.sceneHint", this);
  }

  onEnter(buildingName) {
    if (this.core.ground && this.core.ground.hideAllBuildingLabel) {
      this.core.ground.hideAllBuildingLabel();
    }
    this.currentPoint = null;
    EquipmentPlate.onLoad(this, this.core);

    if (!this.sceneHint) {
      this.sceneHint = new SceneHint();
    }

    this.sceneHint.show("右键双击返回室外");

    this.setIndoorHDRSky();

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
    const ground = new SpecialGround(center, min);
    this.scene.add(ground);
  }

  resetControls() {
    Reflect.ownKeys(controlsParameters).forEach((key) => {
      this.controls[key] = this.controls.data[key];
    });
  }

  onChangeSystemCustom(state, floorName, buildingName) {
    if (state === "outToIn") {
      let a = this.onEnter(buildingName).then(() => {
        this.changeFloor(floorName);
      });
    }
    if (state === "inToInSingle") {
      this.changeFloor(floorName);
    }
    if (state === "inToInOther") {
      this.clearIndoorData();
      this.onEnter(buildingName).then(() => {
        this.changeFloor(floorName);
      });
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
    child.castShadow = true;
    child.receiveShadow = true;

    if (child.material.transparent) {
      child.renderOrder = 3;
      child.material.depthWrite = true;
    }

    child.material = child.material.clone();
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
    const param = getBoxCenter(this.building);
    this.createGround(param.center, param.min);

    this.createAndSetupLights(this.building);

    if (this.scene.environment) {
      this.processIndoorEnvMapMaterials();
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
      const alpha = (_distance - Math.sqrt(radius) * 12) / _distance;
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
        center.z + cameraDistance * 0.6
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

    this.clearIndoorHDR();
    this.removeIndoorLights();

    this.dispose();
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
    if (!this.currentFloor) {
      this.endChangeFloor = false;
      this.removeEventListener();
      this.addPointerLister();
      this.addIndoorEvent();
      !this.core.isFollowing() ? this.addRightDbClickReset() : null;
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

        if (this.sceneHint) {
          this.sceneHint.updateMessage("右键双击显示楼栋");
        }
      });
      this.buildingAnimate(floor);
    }
    if (this.currentFloor.name === floor) return;

    this.floorSwitchInner(floor);
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
    this.eventClear.forEach((clear) => clear());
    this.eventClear = [];
    this.resetEffect();
  }

  dispose() {
    this.currentFloor = null;
    this.buildingObject = {};
    this.removeEventListener();
    this.resetData();
    this.scene.dispose();
    lightIndexUpdate();

    if (this.sceneHint) {
      this.sceneHint.destroy();
      this.sceneHint = null;
    }

    this.removeLightHelpers();
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
   * 清理室内系统数据（用于室内切换时的清理）
   */
  clearIndoorData() {
    this.removeEventListener();
    this.resetData();
    this.disposeGatherOrSilent();

    if (this.sceneHint) {
      this.sceneHint.hide();
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
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.5);
    this.ambientLight = ambientLight;
    this._add(this.ambientLight);

    // 创建主方向光
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.4);
    directionalLight.shadow.camera.near = 1;
    directionalLight.shadow.camera.far = 1000;
    directionalLight.shadow.camera.right = 1000;
    directionalLight.shadow.camera.left = -1000;
    directionalLight.shadow.camera.top = 600;
    directionalLight.shadow.camera.bottom = -600;
    directionalLight.shadow.mapSize.width = Math.pow(2, 11);
    directionalLight.shadow.mapSize.height = Math.pow(2, 11);
    directionalLight.shadow.blurSamples = 8;
    directionalLight.shadow.radius = 1.15;
    directionalLight.shadow.bias = -0.0015;
    directionalLight.castShadow = true;

    // 创建主方向光的目标点
    const mainLightTarget = new THREE.Object3D();
    mainLightTarget.position.copy(center);
    directionalLight.target = mainLightTarget;
    this._add(mainLightTarget);

    this.directionLight = directionalLight;
    this._add(this.directionLight);

    // 创建辅助方向光
    const auxiliaryLight = new THREE.DirectionalLight(0xffffff, 0.4);

    // 创建辅助方向光的目标点
    const auxiliaryLightTarget = new THREE.Object3D();
    auxiliaryLightTarget.position.copy(center);
    auxiliaryLight.target = auxiliaryLightTarget;
    this._add(auxiliaryLightTarget);

    this.auxiliaryLight = auxiliaryLight;
    this._add(this.auxiliaryLight);

    this.lights = {
      ambient: this.ambientLight,
      main: this.directionLight,
      auxiliary: this.auxiliaryLight,
    };

    // 根据建筑尺寸调整灯光位置
    const mainLightHeight = center.y + buildingHeight * 0.8;
    const mainLightOffset = maxDimension * 0.8;

    // 主方向光位置：建筑中心上方，稍微偏移
    this.lights.main.position.set(
      center.x - mainLightOffset * 0.5,
      mainLightHeight,
      center.z - mainLightOffset * 0.8
    );

    // 调整主方向光的阴影相机参数
    const shadowSize = maxDimension * 2;
    this.lights.main.shadow.camera.left = -shadowSize;
    this.lights.main.shadow.camera.right = shadowSize;
    this.lights.main.shadow.camera.top = shadowSize;
    this.lights.main.shadow.camera.bottom = -shadowSize;
    this.lights.main.shadow.camera.near = 0.1;
    this.lights.main.shadow.camera.far = maxDimension * 4;
    this.lights.main.shadow.camera.updateProjectionMatrix();

    // 调整辅助方向光位置
    const auxiliaryLightDistance = maxDimension * 1.2;
    this.lights.auxiliary.position.set(
      center.x + auxiliaryLightDistance * 0.6,
      center.y + buildingHeight * 0.6,
      center.z + auxiliaryLightDistance * 0.4
    );

    // 根据建筑尺寸调整灯光强度
    const buildingVolume = buildingWidth * buildingHeight * buildingDepth;
    const volumeFactor = Math.min(buildingVolume / 1000000, 2.0);

    this.lights.main.intensity = 1.4 * volumeFactor;
    this.lights.auxiliary.intensity = 0.4 * volumeFactor;
    this.lights.ambient.intensity = 1.5 * Math.min(volumeFactor, 1.5);

    // 强制更新矩阵世界
    this.lights.main.target.updateMatrixWorld();
    this.lights.auxiliary.target.updateMatrixWorld();

    console.log("室内灯光系统创建完成:", {
      ambient: this.lights.ambient.intensity,
      main: this.lights.main.intensity,
      auxiliary: this.lights.auxiliary.intensity,
      mainPosition: this.lights.main.position,
      auxiliaryPosition: this.lights.auxiliary.position,
    });

    this.addLightHelpers();
  }

  /**
   * 移除室内灯光系统
   */
  removeIndoorLights() {
    this.removeLightHelpers();

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

    this.ambientLight = null;
    this.directionLight = null;
    this.auxiliaryLight = null;
  }
}
