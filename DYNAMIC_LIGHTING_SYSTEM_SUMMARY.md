# 室内动态灯光系统实现总结

## 功能概述

实现了室内子系统的动态灯光管理，每次进入场景时根据建筑包围盒生成灯光，离开场景时移除灯光，确保资源的正确管理和最佳的光照效果。

## 核心特性

### 🔄 **动态生命周期管理**

- **进入时创建**: 每次 `onEnter` 时创建完整的灯光系统
- **离开时移除**: 每次 `onLeave` 时完全清理灯光资源
- **按需调整**: 根据建筑包围盒自动调整灯光位置和参数

### 🏗️ **基于建筑包围盒的智能调整**

- **位置计算**: 根据建筑尺寸自动计算最佳灯光位置
- **强度调整**: 根据建筑体积动态调整灯光强度
- **阴影优化**: 根据建筑尺寸优化阴影相机参数

### 💡 **完整的灯光系统**

- **环境光**: 提供基础环境照明
- **主方向光**: 主要光源，支持阴影
- **辅助方向光**: 补充光源，减少阴影过重

## 实现细节

### 1. 灯光创建流程

```javascript
createIndoorLights() {
  // 创建环境光
  const ambientLight = new THREE.AmbientLight(0xffffff, 1.5);

  // 创建主方向光（支持阴影）
  const directionalLight = new THREE.DirectionalLight(0xffffff, 1.4);
  // 配置阴影参数...

  // 创建辅助方向光
  const auxiliaryLight = new THREE.DirectionalLight(0xffffff, 0.4);

  // 保存灯光引用
  this.lights = { ambient, main, auxiliary };
}
```

### 2. 基于包围盒的灯光调整

```javascript
adjustLightsToBuilding(building) {
  // 获取建筑包围盒
  const box = new THREE.Box3().setFromObject(building);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());

  // 计算最佳位置
  const maxDimension = Math.max(size.x, size.y, size.z);
  const mainLightDistance = maxDimension * 1.5;

  // 调整主方向光位置
  lights.main.position.set(
    center.x - mainLightOffset * 0.5,
    center.y + buildingHeight * 0.8,
    center.z - mainLightOffset * 0.8
  );

  // 调整阴影参数
  const shadowSize = maxDimension * 2;
  lights.main.shadow.camera.left = -shadowSize;
  // ... 其他阴影参数

  // 根据体积调整强度
  const buildingVolume = size.x * size.y * size.z;
  const volumeFactor = Math.min(buildingVolume / 1000000, 2.0);
  lights.main.intensity = 1.4 * volumeFactor;
}
```

### 3. 资源清理流程

```javascript
removeIndoorLights() {
  // 移除灯光辅助器
  this.removeLightHelpers();

  // 移除并释放灯光资源
  if (lights.ambient) {
    scene.remove(lights.ambient);
    lights.ambient.dispose();
  }
  // ... 其他灯光

  // 清理引用
  this.lights = null;
}
```

## 集成点

### 1. 进入场景 (`onEnter`)

```javascript
onEnter(buildingName) {
  // 设置HDR天空
  this.setIndoorHDRSky();

  // 创建室内灯光系统
  this.createIndoorLights();

  // 加载建筑模型...
}
```

### 2. 建筑加载完成 (`onLoaded`)

```javascript
onLoaded() {
  // 根据建筑包围盒调整灯光位置
  if (this.lights) {
    this.adjustLightsToBuilding(this.building);
  }

  // 其他初始化...
}
```

### 3. 离开场景 (`onLeave`)

```javascript
onLeave() {
  // 清理HDR环境贴图
  this.clearIndoorHDR();

  // 移除室内灯光系统
  this.removeIndoorLights();

  // 其他清理...
}
```

## 灯光配置参数

### 环境光

- **颜色**: 白色 (0xffffff)
- **强度**: 1.5 (基础值)
- **作用**: 提供均匀的环境照明

### 主方向光

- **颜色**: 白色 (0xffffff)
- **强度**: 1.4 (基础值)
- **阴影**: 启用，高质量设置
- **作用**: 主要光源，产生阴影

### 辅助方向光

- **颜色**: 白色 (0xffffff)
- **强度**: 0.4 (基础值)
- **作用**: 补充照明，减少阴影过重

## 智能调整算法

### 位置计算

1. **主方向光**: 建筑中心上方 80%高度，偏移建筑最大尺寸的 80%
2. **辅助方向光**: 建筑右侧，高度为建筑高度的 60%

### 强度调整

- **体积因子**: `buildingVolume / 1000000` (最大 2.0)
- **主方向光**: 1.4 × 体积因子
- **辅助方向光**: 0.4 × 体积因子
- **环境光**: 1.5 × 体积因子 (最大 1.5)

### 阴影参数

- **阴影范围**: 建筑最大尺寸的 2 倍
- **近平面**: 0.1
- **远平面**: 建筑最大尺寸的 4 倍

## 测试验证

### 测试页面功能

- ✅ 模拟进入/离开室内场景
- ✅ 动态创建/移除灯光系统
- ✅ 实时调整建筑尺寸
- ✅ 灯光辅助器显示/隐藏
- ✅ 状态监控和日志记录

### 测试场景

1. **基础功能测试**

   - 进入场景 → 灯光创建 → 位置调整
   - 离开场景 → 灯光移除 → 资源清理

2. **建筑尺寸变化测试**

   - 小建筑 → 灯光位置和强度调整
   - 大建筑 → 灯光位置和强度调整
   - 实时尺寸变化 → 灯光实时调整

3. **资源管理测试**
   - 多次进入/离开 → 无内存泄漏
   - 灯光辅助器 → 正确清理
   - 阴影资源 → 正确释放

## 性能优化

### 内存管理

- **及时清理**: 离开场景时立即清理所有灯光资源
- **引用清理**: 清理所有对象引用，避免内存泄漏
- **阴影优化**: 根据建筑尺寸优化阴影贴图大小

### 渲染优化

- **按需创建**: 只在需要时创建灯光
- **智能调整**: 根据建筑尺寸调整灯光参数
- **辅助器控制**: 可选的调试辅助器

## 兼容性

- ✅ 与 HDR 环境贴图系统完全兼容
- ✅ 与现有室内子系统无缝集成
- ✅ 与材质处理系统兼容
- ✅ 与场景切换系统兼容

## 调试功能

### 灯光辅助器

- **方向光辅助器**: 显示灯光方向和强度
- **阴影相机辅助器**: 显示阴影范围
- **可切换显示**: 开发时启用，生产时隐藏

### 状态监控

- **灯光数量**: 实时显示当前灯光数量
- **创建状态**: 显示灯光系统创建状态
- **调整状态**: 显示灯光位置调整状态

## 总结

动态灯光系统实现了室内场景的智能光照管理，具有以下优势：

1. **资源效率**: 按需创建和清理，避免资源浪费
2. **智能调整**: 根据建筑尺寸自动优化光照效果
3. **完整集成**: 与现有系统完美集成
4. **易于维护**: 清晰的代码结构和完善的文档
5. **调试友好**: 提供丰富的调试和监控功能

该系统为不同尺寸的室内建筑提供了最佳的光照效果，同时确保了良好的性能和资源管理。
