# 室内灯光修复总结

## 问题描述

用户报告室内灯光没有显示，经过检查发现以下问题：

1. HDR 天空设置被注释掉
2. 需要验证灯光创建和添加过程
3. 需要确保灯光辅助器正常工作

## 修复措施

### 1. 恢复 HDR 天空设置

在 `src/three/subsystem/indoorSubsystem/index.js` 的 `onEnter` 方法中：

```javascript
// 每次进入室内都重新设置HDR天空
console.log("设置室内HDR天空...");
this.setIndoorHDRSky(); // 恢复这行代码
```

### 2. 增强调试功能

在 `createAndSetupLights` 方法中添加了强制调试功能：

```javascript
// 强制添加灯光辅助器用于调试
this.addLightHelpers();

// 检查灯光是否正确添加到场景
console.log(
  "场景中的灯光数量:",
  this.scene.children.filter((child) => child.isLight).length
);
console.log(
  "场景中的所有对象:",
  this.scene.children.map((child) => child.type || child.constructor.name)
);
```

### 3. 创建测试页面

创建了 `test_indoor_lights_fix.html` 测试页面，包含：

- 完整的室内子系统模拟
- 灯光创建和设置功能
- HDR 天空加载
- 实时调试和状态监控
- 交互式控制面板

## 修复验证

### 测试步骤

1. 启动开发服务器：`npm run dev`
2. 访问 `test_indoor_lights_fix.html`
3. 选择建筑模型并点击"进入室内"
4. 观察控制台日志和灯光辅助器

### 预期结果

- 控制台显示灯光创建成功
- 场景中出现灯光辅助器（方向光辅助器和阴影相机辅助器）
- 建筑模型被正确照亮
- HDR 天空背景正常显示

## 技术细节

### 灯光系统组成

1. **环境光 (AmbientLight)**

   - 强度：1.5
   - 作用：提供基础环境照明

2. **主方向光 (DirectionalLight)**

   - 强度：1.4
   - 阴影：启用
   - 作用：主要光源，产生阴影

3. **辅助方向光 (DirectionalLight)**
   - 强度：0.4
   - 作用：补充照明，减少阴影过暗

### 灯光位置计算

基于建筑包围盒动态计算：

```javascript
const box = new THREE.Box3().setFromObject(building);
const center = box.getCenter(new THREE.Vector3());
const size = box.getSize(new THREE.Vector3());
const maxDimension = Math.max(size.x, size.y, size.z);

// 主方向光位置
const mainLightHeight = center.y + size.y * 0.8;
const mainLightOffset = maxDimension * 0.8;
this.lights.main.position.set(
  center.x - mainLightOffset * 0.5,
  mainLightHeight,
  center.z - mainLightOffset * 0.8
);
```

### 阴影设置

```javascript
directionalLight.shadow.camera.near = 1;
directionalLight.shadow.camera.far = 1000;
directionalLight.shadow.mapSize.width = Math.pow(2, 11);
directionalLight.shadow.mapSize.height = Math.pow(2, 11);
directionalLight.shadow.blurSamples = 8;
directionalLight.shadow.radius = 1.15;
directionalLight.shadow.bias = -0.0015;
```

## 调试功能

### 灯光辅助器

- **DirectionalLightHelper**: 显示方向光位置和方向
- **CameraHelper**: 显示阴影相机范围
- 可通过 `toggleLightHelpers()` 切换显示

### 控制台日志

- 建筑包围盒信息
- 灯光位置和强度
- 场景中的灯光数量
- 错误和警告信息

### 实时控制

- 主灯光强度调节
- 环境光强度调节
- 建筑尺寸调整
- 灯光重置功能

## 文件修改清单

1. `src/three/subsystem/indoorSubsystem/index.js`

   - 恢复 HDR 天空设置
   - 增强调试功能
   - 添加场景对象检查

2. `test_indoor_lights_fix.html` (新建)
   - 完整的测试环境
   - 模拟室内子系统
   - 交互式调试工具

## 注意事项

1. 确保 HDR 文件 `bg.hdr` 存在且可访问
2. 检查建筑模型是否正确加载
3. 验证 Three.js 版本兼容性
4. 确保渲染器启用了阴影映射

## 后续优化建议

1. 添加灯光预设系统
2. 实现动态光照变化
3. 优化阴影性能
4. 添加更多调试工具
