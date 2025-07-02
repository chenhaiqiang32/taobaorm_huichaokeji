# 材质流动动画功能总结

## 功能描述

为包含"move"的 mesh 自动添加材质流动动画，实现纹理的连续流动效果。

## 实现原理

### 1. 检测条件

- 遍历模型中的所有 mesh
- 检查 mesh 名称是否包含"move"字符串
- 检查 mesh 是否有材质和纹理贴图

### 2. 流动效果

- 通过修改材质的 `texture.offset.x` 实现水平流动
- 流动速度可配置（默认：0.001）
- 当偏移值超过 1 时自动重置，避免数值过大

## 代码实现

### 全局动画管理器扩展 (`src/three/loader/index.js`)

```javascript
class GlobalAnimationManager {
  constructor() {
    this.mixers = new Map();
    this.materialFlows = new Map(); // 新增：存储材质流动动画
    this.clock = new THREE.Clock();
    this.isPlaying = false;
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

          // 当偏移值过大时重置，避免数值过大
          if (material.map.offset.x > 1) {
            material.map.offset.x -= 1;
          }
        }
      });
    }
  }
}
```

### 材质流动处理函数

```javascript
function handleMaterialFlowAnimation(model) {
  const speedX = 0.001; // 流动速度，可以根据需要调整

  model.traverse((child) => {
    if (child.isMesh && child.name && child.name.includes("move")) {
      // 检查材质
      if (child.material) {
        if (Array.isArray(child.material)) {
          // 处理材质数组
          child.material.forEach((material) => {
            if (material.map) {
              // 保存原始偏移值
              if (!material.userData.originalOffset) {
                material.userData.originalOffset = {
                  x: material.map.offset.x,
                  y: material.map.offset.y,
                };
              }
              // 添加到全局动画管理器
              globalAnimationManager.addMaterialFlow(material, speedX);
            }
          });
        } else {
          // 处理单个材质
          if (child.material.map) {
            // 保存原始偏移值
            if (!child.material.userData.originalOffset) {
              child.material.userData.originalOffset = {
                x: child.material.map.offset.x,
                y: child.material.map.offset.y,
              };
            }
            // 添加到全局动画管理器
            globalAnimationManager.addMaterialFlow(child.material, speedX);
          }
        }

        console.log(`✅ 为包含"move"的mesh "${child.name}" 添加材质流动动画`);
      }
    }
  });
}
```

## 使用方法

### 1. 自动应用

- 所有通过 `loadGLTF` 加载的模型都会自动检查
- 包含"move"的 mesh 会自动添加流动动画
- 无需手动配置

### 2. 命名规范

- mesh 名称必须包含"move"字符串
- 例如：`water_move`、`flow_move`、`river_move` 等

### 3. 材质要求

- mesh 必须有材质
- 材质必须有纹理贴图（`material.map`）

## 配置选项

### 流动速度

```javascript
const speedX = 0.001; // 可以在 handleMaterialFlowAnimation 函数中调整
```

### 流动方向

- 当前实现：水平流动（X 轴）
- 可扩展：垂直流动（Y 轴）或其他方向

## 管理方法

### 移除特定材质的流动动画

```javascript
globalAnimationManager.removeMaterialFlow(material);
```

### 清理所有材质流动动画

```javascript
globalAnimationManager.clearMaterialFlows();
```

## 应用场景

1. **水流效果**: 河流、瀑布等水体的流动
2. **云层移动**: 天空中的云朵飘动
3. **烟雾效果**: 烟雾的流动和扩散
4. **能量流动**: 能量管道或光束的流动
5. **传送带**: 工业场景中的传送带运动

## 性能优化

- 只对包含"move"的 mesh 进行处理，避免不必要的计算
- 使用 Map 结构存储材质流动数据，提高查找效率
- 在全局动画管理器中统一更新，减少重复计算

## 注意事项

1. **命名规范**: mesh 名称必须包含"move"才能触发流动动画
2. **材质要求**: 必须有纹理贴图才能实现流动效果
3. **性能考虑**: 流动动画会持续运行，注意控制数量
4. **重置机制**: 偏移值超过 1 时自动重置，避免数值过大

## 扩展建议

1. **多方向流动**: 支持 Y 轴、Z 轴或其他方向的流动
2. **速度变化**: 支持动态调整流动速度
3. **流动模式**: 支持不同的流动模式（循环、往返等）
4. **材质类型**: 支持更多材质类型的流动效果
