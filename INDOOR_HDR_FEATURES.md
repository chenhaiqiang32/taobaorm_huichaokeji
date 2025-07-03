# 室内 HDR 环境贴图和天空效果

## 功能概述

为室内子系统添加了金色 HDR 环境贴图和 HDR 天空效果，提供更真实的光照和反射效果。

## 主要特性

### 1. 金色 HDR 天空

- 使用 `sunny2.hdr` 作为主要 HDR 文件，提供金色调的天空效果
- 支持高动态范围渲染，提供更真实的光照效果
- 自动设置场景背景和环境贴图

### 2. 多层备用方案

- **主要方案**: `sunny2.hdr` - 金色调 HDR 文件
- **备用方案**: `bg.hdr` - 备用 HDR 文件
- **默认方案**: 程序生成的金色渐变天空

### 3. 环境反射

- 为所有 PBR 材质自动设置环境贴图
- 可调节的环境反射强度
- 支持金属度和粗糙度参数

## 实现细节

### 核心方法

#### `setIndoorHDRSky()`

- 加载主要 HDR 文件 (`sunny2.hdr`)
- 设置纹理映射为等距矩形反射映射
- 配置曝光度和颜色空间
- 设置场景背景和环境贴图

#### `setFallbackIndoorHDR()`

- 当主要 HDR 加载失败时的备用方案
- 使用 `bg.hdr` 文件
- 调整不同的曝光度参数

#### `setDefaultIndoorSky()`

- 当所有 HDR 文件都加载失败时的默认方案
- 程序生成金色渐变天空
- 使用 Canvas 创建渐变纹理

#### `processIndoorEnvMapMaterials()`

- 遍历场景中的所有材质
- 为 PBR 材质设置环境贴图
- 支持多材质对象

#### `setupIndoorMaterial(material)`

- 为单个材质设置环境贴图
- 配置环境反射强度
- 支持 MeshStandardMaterial 和 MeshPhysicalMaterial

#### `clearIndoorHDR()`

- 清理 HDR 环境贴图资源
- 释放纹理内存
- 重置材质环境贴图引用

### 集成点

#### 初始化

在 `IndoorSubsystem` 构造函数中调用 `setIndoorHDRSky()`

#### 模型处理

在 `modelProcessing()` 方法中为每个模型材质设置环境贴图

#### 清理

在 `onLeave()` 和 `clearIndoorData()` 方法中清理 HDR 资源

## 技术参数

### HDR 设置

- **数据类型**: `THREE.FloatType` - 提供更好的 HDR 效果
- **纹理映射**: `THREE.EquirectangularReflectionMapping`
- **颜色空间**: `THREE.SRGBColorSpace`
- **曝光度**: 1.5 (主要), 1.8 (备用)

### 环境贴图设置

- **强度**: 1.2 (主要), 1.0 (备用), 0.8 (默认)
- **材质反射强度**: 0.6
- **金属度**: 0.2 (室内模型默认)
- **粗糙度**: 0.8 (室内模型默认)

### 默认天空渐变

- **顶部**: #FFD700 (金色)
- **30%**: #FFA500 (橙色)
- **70%**: #FF8C00 (深橙色)
- **底部**: #FF4500 (红橙色)

## 使用方法

### 自动使用

室内子系统会自动在初始化时加载 HDR 效果，无需手动配置。

### 手动测试

可以使用 `test_hdr.html` 文件来测试 HDR 效果：

```bash
# 启动本地服务器
python -m http.server 8000

# 访问测试页面
http://localhost:8000/test_hdr.html
```

## 文件结构

```
src/three/subsystem/indoorSubsystem/
├── index.js                    # 主要实现文件
├── test_hdr.html              # 测试页面
└── INDOOR_HDR_FEATURES.md     # 本文档

public/
├── sunny2.hdr                 # 主要HDR文件 (金色调)
└── bg.hdr                     # 备用HDR文件
```

## 注意事项

1. **性能考虑**: HDR 文件较大，加载时间可能较长
2. **兼容性**: 需要支持 WebGL 2.0 的浏览器
3. **内存管理**: 离开室内场景时会自动清理 HDR 资源
4. **错误处理**: 提供了完整的错误处理和备用方案

## 未来改进

1. **动态 HDR 切换**: 支持不同时间段的 HDR 效果
2. **性能优化**: 实现 HDR 文件的预加载和缓存
3. **用户配置**: 允许用户自定义 HDR 参数
4. **更多 HDR 文件**: 添加更多不同风格的 HDR 文件
