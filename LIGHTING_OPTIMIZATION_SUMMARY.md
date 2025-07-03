# 室内灯光系统优化总结

## 优化背景

用户反馈室内灯光效果不明显，需要将灯光创建和位置设置合并在一起，确保在建筑包围盒计算完成后立即创建和设置灯光。

## 优化方案

### 🔄 **流程优化**

**优化前**:

```javascript
onEnter() {
  this.setIndoorHDRSky();
  this.createIndoorLights(); // 在onEnter时创建灯光
}

onLoaded() {
  this.adjustLightsToBuilding(this.building); // 在onLoaded时调整位置
}
```

**优化后**:

```javascript
onEnter() {
  this.setIndoorHDRSky();
  // 移除灯光创建，等待建筑加载完成
}

onLoaded() {
  this.createAndSetupLights(this.building); // 一次性创建和设置
}
```

### 🎯 **核心改进**

1. **时机优化**: 将灯光创建从 `onEnter` 移到 `onLoaded`，确保建筑完全加载后再创建灯光
2. **方法合并**: 创建新的 `createAndSetupLights()` 方法，将创建和设置合并为一个步骤
3. **包围盒优先**: 先计算建筑包围盒，再根据包围盒信息创建和设置灯光

## 实现细节

### 新的 `createAndSetupLights` 方法

```javascript
createAndSetupLights(building) {
  // 1. 获取建筑包围盒
  const box = new THREE.Box3().setFromObject(building);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());

  // 2. 计算建筑尺寸
  const buildingWidth = size.x;
  const buildingHeight = size.y;
  const buildingDepth = size.z;
  const maxDimension = Math.max(buildingWidth, buildingHeight, buildingDepth);

  // 3. 创建灯光系统
  // 环境光
  const ambientLight = new THREE.AmbientLight(0xffffff, 1.5);

  // 主方向光
  const directionalLight = new THREE.DirectionalLight(0xffffff, 1.4);
  // 配置阴影参数...

  // 辅助方向光
  const auxiliaryLight = new THREE.DirectionalLight(0xffffff, 0.4);

  // 4. 根据包围盒设置位置
  const mainLightHeight = center.y + buildingHeight * 0.8;
  const mainLightOffset = maxDimension * 0.8;

  // 主方向光位置
  this.lights.main.position.set(
    center.x - mainLightOffset * 0.5,
    mainLightHeight,
    center.z - mainLightOffset * 0.8
  );

  // 5. 设置阴影参数
  const shadowSize = maxDimension * 2;
  this.lights.main.shadow.camera.left = -shadowSize;
  // ... 其他阴影参数

  // 6. 调整灯光强度
  const buildingVolume = buildingWidth * buildingHeight * buildingDepth;
  const volumeFactor = Math.min(buildingVolume / 1000000, 2.0);
  this.lights.main.intensity = 1.4 * volumeFactor;
}
```

## 优化效果

### ✅ **解决的问题**

1. **灯光效果不明显**: 现在灯光位置完全基于建筑包围盒计算，确保最佳光照效果
2. **时机问题**: 确保在建筑完全加载后再创建灯光，避免位置计算错误
3. **代码分离**: 将创建和设置合并，减少代码复杂度

### 🎨 **视觉效果提升**

- **更准确的位置**: 灯光位置完全基于建筑实际尺寸
- **更合适的强度**: 根据建筑体积动态调整灯光强度
- **更好的阴影**: 阴影范围根据建筑尺寸优化

### ⚡ **性能优化**

- **减少调用次数**: 从两次调用（创建+设置）减少到一次调用
- **避免重复计算**: 包围盒计算一次，同时用于创建和设置
- **更好的资源管理**: 确保灯光在正确的时机创建

## 测试验证

### 测试页面更新

更新了 `test_indoor_lights_dynamic.html`，添加了：

1. **新的方法**: `createAndSetupLights()` 函数
2. **新的按钮**: "创建并设置灯光" 按钮
3. **优化流程**: "模拟进入室内" 现在使用新的合并方法

### 测试场景

1. **基础功能测试**

   - 点击"模拟进入室内" → 自动创建并设置灯光
   - 点击"创建并设置灯光" → 手动测试合并方法

2. **建筑尺寸变化测试**

   - 修改建筑尺寸 → 重新创建并设置灯光
   - 验证灯光位置和强度是否正确调整

3. **性能测试**
   - 多次进入/离开 → 验证资源管理
   - 大建筑测试 → 验证性能表现

## 兼容性

- ✅ 保持与现有系统的完全兼容
- ✅ 保留原有的 `createIndoorLights()` 和 `adjustLightsToBuilding()` 方法
- ✅ 与 HDR 环境贴图系统完美配合
- ✅ 与场景切换系统无缝集成

## 调试功能

### 控制台输出

新的方法提供详细的控制台输出：

```javascript
console.log("建筑包围盒信息:", {
  center: center,
  size: size,
  min: min,
  max: max,
});

console.log("灯光创建和位置设置完成:", {
  mainLight: this.lights.main.position,
  auxiliaryLight: this.lights.auxiliary.position,
  mainIntensity: this.lights.main.intensity,
  auxiliaryIntensity: this.lights.auxiliary.intensity,
  ambientIntensity: this.lights.ambient.intensity,
});
```

### 调试辅助器

- 可选的灯光辅助器显示
- 阴影相机辅助器
- 实时状态监控

## 总结

这次优化解决了室内灯光效果不明显的问题，通过：

1. **时机优化**: 在建筑完全加载后创建灯光
2. **方法合并**: 将创建和设置合并为一个步骤
3. **包围盒优先**: 确保灯光位置完全基于建筑实际尺寸

优化后的系统能够：

- 为不同尺寸的建筑提供最佳的光照效果
- 确保灯光位置和强度完全匹配建筑尺寸
- 提供更好的视觉效果和用户体验
- 保持优秀的性能和资源管理

这个优化确保了室内场景的光照效果更加明显和准确，为用户提供了更好的视觉体验。
