# 室内模型按需加载实现

## 概述

本项目实现了室内模型的按需加载机制，只有在用户真正进入室内时才加载对应的室内模型和设备树数据，避免了在室外场景初始化时提前加载所有室内模型的问题。

## 问题背景

### 原有问题

- 在室外系统初始化时，会调用 `handleIndoorEquipTree()` 方法
- 该方法会加载所有室内模型文件（`indoorModelFiles`）
- 导致在用户还未进入室内时就消耗了不必要的网络带宽和内存资源

### 解决方案

实现按需加载机制，只在用户真正需要时才加载对应的室内模型。

## 实现方案

### 1. 设备树数据管理器 (`EquipmentTreeManager`)

**文件位置**: `src/three/subsystem/indoorSubsystem/equipmentTreeManager.js`

**主要功能**:

- 管理室内模型的设备树数据
- 提供按需加载接口
- 缓存已加载的数据，避免重复加载
- 处理并发加载请求

**核心方法**:

```javascript
// 获取指定建筑的设备树数据
async getEquipmentTree(buildingName)

// 加载指定建筑的设备树数据
async loadBuildingEquipmentTree(buildingName)

// 预加载所有建筑（可选）
async preloadAllEquipmentTrees()

// 清除指定建筑的数据
clearBuildingEquipmentTree(buildingName)
```

### 2. 修改室内系统

**文件位置**: `src/three/subsystem/indoorSubsystem/index.js`

**主要修改**:

- 在 `onEnter()` 方法中添加按需加载逻辑
- 将方法改为异步，支持等待设备树数据加载完成

```javascript
async onEnter(buildingName) {
  // ... 其他初始化代码 ...

  // 按需加载设备树数据
  try {
    console.log(`开始按需加载建筑 ${buildingName} 的设备树数据...`);
    await equipmentTreeManager.getEquipmentTree(buildingName);
    console.log(`建筑 ${buildingName} 设备树数据加载完成`);
  } catch (error) {
    console.error(`加载建筑 ${buildingName} 设备树数据失败:`, error);
  }

  // ... 继续加载室内模型 ...
}
```

### 3. 修改主系统

**文件位置**: `src/three/index.js`

**主要修改**:

- 将相关方法改为异步，支持等待室内系统初始化完成
- 修改所有调用 `changeSystem`、`changeSystemCustom` 等方法的调用点

**涉及的方法**:

- `changeSystem()` - 系统切换
- `changeIndoor()` - 进入室内
- `changeSystemCustom()` - 自定义系统切换
- `searchPerson()` - 搜索人员
- `searchCamera()` - 搜索摄像头
- `searchInspection()` - 搜索巡检
- `personAlarmInit()` - 人员报警
- `startFollow()` - 开始跟踪
- `followChangeScene()` - 跟踪场景切换

### 4. 移除提前加载逻辑

**文件位置**: `src/three/subsystem/Ground/index.js`

**主要修改**:

- 移除 `handleIndoorEquipTree()` 方法
- 移除在室外模型加载完成后调用该方法的逻辑
- 移除不再需要的 `indoorModelFiles` 导入

## 优势

### 1. 性能优化

- **减少初始加载时间**: 室外场景初始化时不再加载室内模型
- **节省网络带宽**: 只加载用户实际需要的模型
- **降低内存占用**: 避免同时加载所有室内模型

### 2. 用户体验

- **更快的初始加载**: 用户进入室外场景更快
- **按需加载**: 只有在进入室内时才加载对应模型
- **缓存机制**: 已加载的模型数据会被缓存，再次进入时无需重新加载

### 3. 可维护性

- **模块化设计**: 设备树管理独立成模块
- **清晰的职责分离**: 每个模块负责自己的加载逻辑
- **易于扩展**: 可以轻松添加新的加载策略

## 使用方式

### 基本使用

```javascript
// 进入室内时会自动按需加载
await store3D.changeIndoor("AFS9512042");
```

### 手动预加载（可选）

```javascript
// 如果需要预加载所有建筑数据
await equipmentTreeManager.preloadAllEquipmentTrees();
```

### 检查加载状态

```javascript
// 检查建筑是否已加载
const isLoaded = equipmentTreeManager.isBuildingLoaded("AFS9512042");

// 获取已加载的建筑列表
const loadedBuildings = equipmentTreeManager.getLoadedBuildings();
```

## 注意事项

1. **异步处理**: 所有涉及系统切换的方法都改为异步，调用时需要使用 `await`
2. **错误处理**: 设备树加载失败不会阻止室内模型加载，但会在控制台输出错误信息
3. **缓存管理**: 已加载的设备树数据会一直保存在内存中，如需清理可调用相应方法
4. **并发处理**: 同一建筑的多次加载请求会被合并，避免重复加载

## 调试信息

设备树管理器会输出详细的调试信息，包括：

- 🔍 请求获取设备树数据
- ✅ 数据已缓存，直接返回
- ⏳ 数据正在加载中
- 🚀 开始加载数据
- ✅ 数据加载完成
- ❌ 数据加载失败

这些信息可以帮助开发者了解加载过程和排查问题。
