# WebGL 纹理单元累积问题修复

## 问题描述

在频繁的室内场景切换过程中，出现了 WebGL 着色器错误：

```
THREE.WebGLProgram: Shader Error 0 - VALIDATE_STATUS false
Material Name: Plastic010_1K-JPG
Material Type: MeshStandardMaterial
Program Info Log: FRAGMENT shader texture image units count exceeds MAX_TEXTURE_IMAGE_UNITS(16)
```

这个错误表明片段着色器中的纹理图像单元数量超过了 WebGL 的最大限制（16 个），通常是由于材质和纹理没有正确清理导致的资源累积。

**新增发现的问题**：

- 室内切换室内时不会执行 `onLeave` 方法
- 灯光系统累积导致场景越来越亮
- 纹理单元持续累积直到超过限制

## 问题根源

1. **场景切换逻辑缺陷**：在 `changeSystemCommon` 方法中，当同一个室内系统重新初始化时，没有强制调用 `onLeave` 进行完整清理
2. **灯光管理不当**：`createAndSetupLights` 方法创建灯光但没有正确管理，`removeIndoorLights` 方法只清理了部分灯光
3. **材质克隆问题**：在 `modelProcessing` 方法中，材质被克隆但没有正确管理生命周期
4. **防抖机制不足**：原有的防抖机制不够严格，无法有效防止频繁切换

## 修复方案

### 1. 强制执行完整清理

在 `src/three/index.js` 中：

- 修改了 `changeSystemCommon` 方法，在室内系统重新初始化时强制调用 `onLeave` 进行完整清理
- 确保每次室内切换都会执行完整的资源清理流程

### 2. 改进灯光管理系统

在 `src/three/subsystem/indoorSubsystem/index.js` 中：

- 修改了 `createAndSetupLights` 方法，在创建新灯光前先清理现有灯光
- 改进了 `removeIndoorLights` 方法，确保清理所有类型的灯光（包括直接添加到场景中的灯光）
- 添加了场景遍历清理，确保没有遗漏的灯光

### 3. 优化清理流程

- 修改了 `onLeave` 方法，确保调用完整的 `clearIndoorData` 清理流程
- 简化了 `dispose` 方法，避免重复清理
- 添加了详细的日志输出，便于调试

### 4. 增强防抖机制

在 `src/message/onMessage.js` 中：

- 添加了 `isChangingScene` 标记，防止在切换过程中接受新的切换请求
- 增加了防抖延迟时间（200ms）和重复检测时间（1 秒）
- 添加了切换完成后的冷却期（500ms）

### 5. 添加强制清理功能

在 `src/three/core/CoreBase.js` 中：

- 添加了 `forceCleanupWebGLResources` 方法，用于在出现问题时手动清理
- 添加了 `disposeMaterial` 方法，确保材质和纹理的彻底清理
- 增强了资源监控功能

## 修复的文件

1. `src/three/index.js`

   - 修改 `changeSystemCommon` 方法，强制调用 `onLeave`
   - 确保室内系统重新初始化时进行完整清理

2. `src/three/subsystem/indoorSubsystem/index.js`

   - 改进 `createAndSetupLights` 和 `removeIndoorLights` 方法
   - 优化 `onLeave` 和 `clearIndoorData` 方法
   - 添加详细的日志输出

3. `src/message/onMessage.js`

   - 增强防抖机制
   - 添加切换状态标记和冷却期

4. `src/three/core/CoreBase.js`
   - 添加强制清理功能
   - 增强资源监控

## 测试验证

更新了 `test-texture-cleanup.js` 测试脚本：

- 增加了切换次数统计
- 每 5 次切换后检查资源使用情况
- 每 10 次切换后执行强制清理
- 添加了强制清理和资源监控按钮
- 延长了测试时间（60 秒）

## 使用方法

1. 应用修复后的代码
2. 在浏览器控制台中运行测试脚本：
   ```javascript
   // 加载测试脚本
   const script = document.createElement("script");
   script.src = "./test-texture-cleanup.js";
   document.head.appendChild(script);
   ```
3. 使用页面右上角的按钮：
   - 蓝色按钮：开始纹理清理测试
   - 红色按钮：强制清理 WebGL 资源
   - 绿色按钮：监控 WebGL 资源使用情况

## 预期效果

- ✅ 消除 WebGL 纹理单元累积错误
- ✅ 解决灯光累积导致场景变亮的问题
- ✅ 确保室内切换室内时执行完整清理
- ✅ 提高室内场景切换的稳定性
- ✅ 减少内存泄漏和资源累积
- ✅ 改善整体性能

## 关键改进点

1. **强制清理**：室内系统重新初始化时强制调用 `onLeave`，确保完整清理
2. **灯光管理**：改进灯光创建和清理逻辑，防止灯光累积
3. **防抖增强**：添加切换状态标记和冷却期，防止频繁切换
4. **强制清理工具**：提供手动清理功能，应对紧急情况
5. **详细监控**：增强日志输出和资源监控，便于问题排查

## 注意事项

1. 修复后的代码会进行更彻底的资源清理，可能会稍微增加场景切换的时间
2. 建议在生产环境中监控 WebGL 资源使用情况
3. 如果仍然出现问题，可以使用强制清理功能
4. 防抖机制可能会影响用户体验，但可以有效防止资源累积
