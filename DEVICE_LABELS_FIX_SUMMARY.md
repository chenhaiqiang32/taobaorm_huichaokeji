# 设备标签功能实现总结

## 功能概述

实现了室内 3D 场景中设备标签的动态更新功能，支持通过 `webUpdateModel` 命令实时更新设备标签的显示。

## 核心功能

### 1. 设备标签创建

- 根据设备数据创建 CSS2D 标签
- 显示设备名称和配置信息
- 标签位置设置在设备包围盒的最高点中心
- 支持可见性控制

### 2. 数据存储

- 数据存储在类实例变量中，不依赖 localStorage
- 按设备编号（code）进行存储和检索
- 支持楼层切换时的数据加载

### 3. 动态更新

- 每次 `webUpdateModel` 推送都会完全替换现有标签
- 清除旧的 CSS2D 对象和 DOM 元素
- 重新生成新的标签

## 实现细节

### 消息处理 (`src/message/onMessage.js`)

```javascript
// 处理 webUpdateModel 命令
case "webUpdateModel":
  if (this.core.currentSystem && this.core.currentSystem.updateDeviceLabels) {
    this.core.currentSystem.updateDeviceLabels(param);
  }
  break;
```

### 室内子系统 (`src/three/subsystem/indoorSubsystem/index.js`)

#### 主要方法

- `updateDeviceLabels(deviceData)` - 更新设备标签（完全替换）
- `createDeviceLabel(device)` - 创建单个设备标签
- `clearDeviceLabels()` - 清除所有设备标签
- `findDeviceByCode(code)` - 根据设备编号查找设备对象

#### 数据存储

- `deviceLabelsData` - 存储设备标签数据的实例变量
- `deviceLabels` - 存储当前显示的标签对象数组

#### 标签定位

- 计算设备包围盒
- 获取包围盒中心点
- 将 Y 坐标设置为包围盒最高点
- 添加适当偏移避免重叠

## 清除功能改进

### 问题描述

用户反馈清除设备标签的方法没有效果，CSS2D 标签依然在场景中存在。

### 解决方案

增强了 `clearDeviceLabels()` 方法的清理逻辑：

1. **详细的调试日志** - 添加了完整的清除过程日志
2. **彻底的 DOM 清理** - 确保 DOM 元素被正确移除
3. **父对象清理** - 从父对象中移除 CSS2D 对象
4. **场景清理** - 从场景中移除 CSS2D 对象
5. **引用清理** - 将所有引用设置为 null
6. **强制清理** - 遍历场景查找残留的 CSS2D 对象
7. **CSS2D 渲染器清理** - 清理 CSS2D 渲染器 DOM 中的残留元素

### 清除逻辑

```javascript
clearDeviceLabels() {
  // 1. 移除DOM元素
  label.element.remove();
  label.element = null;

  // 2. 从父对象中移除CSS2D对象
  if (label.css2dObject.parent) {
    label.css2dObject.parent.remove(label.css2dObject);
  }

  // 3. 从场景中移除CSS2D对象
  this.scene.remove(label.css2dObject);
  label.css2dObject = null;

  // 4. 清理设备对象引用
  label.deviceObject = null;

  // 5. 清空数组
  this.deviceLabels = [];

  // 6. 强制清理场景中残留的CSS2D对象
  this.scene.traverse((object) => {
    if (object.name && object.name.startsWith('device-label-')) {
      this.scene.remove(object);
    }
  });

  // 7. 清理CSS2D渲染器DOM中的残留元素
  const css2dRenderer = document.getElementById('css2dRenderer');
  if (css2dRenderer) {
    const deviceLabels = css2dRenderer.querySelectorAll('.device-label-container');
    deviceLabels.forEach((label) => label.remove());
  }
}
```

## 测试页面

### 主要测试页面

- `test_web_update_model.html` - 基础功能测试
- `test_update_logic.html` - 更新逻辑测试
- `test_clear_labels.html` - 清除功能测试（新增）

### 测试功能

1. **基础清除测试** - 测试基本的创建和清除功能
2. **多次清除测试** - 测试多次创建和清除的稳定性
3. **强制清除测试** - 测试强制清理残留元素的功能
4. **更新逻辑测试** - 测试 webUpdateModel 的清除和重新生成逻辑
5. **DOM 检查工具** - 检查页面中的设备标签 DOM 元素

### 测试工具

- 实时日志显示
- DOM 元素检查
- CSS2D 渲染器检查
- 残留元素检测

## 使用说明

### 发送设备标签数据

```javascript
// 发送设备标签数据
window.parent.postMessage(
  {
    cmd: "webUpdateModel",
    param: [
      {
        name: "设备名称",
        visible: true,
        code: "设备编号",
        configs: [
          { key: "配置项1", value: "值1" },
          { key: "配置项2", value: "值2" },
        ],
      },
    ],
  },
  "*"
);
```

### 清除所有设备标签

```javascript
// 发送空数组清除所有标签
window.parent.postMessage(
  {
    cmd: "webUpdateModel",
    param: [],
  },
  "*"
);
```

## 注意事项

1. **数据格式** - 设备数据必须是数组格式
2. **设备编号** - 设备编号必须与 3D 模型中的设备名称前缀匹配
3. **楼层切换** - 楼层切换时会自动加载对应楼层的设备标签数据
4. **内存管理** - 清除功能会彻底清理所有相关对象，避免内存泄漏
5. **调试信息** - 控制台会输出详细的调试信息，便于问题排查

## 样式定义

设备标签的样式在 `src/style.css` 中定义：

- `.device-label-container` - 标签容器
- `.device-label-main` - 标签主体
- `.device-label-name` - 设备名称
- `.device-label-configs` - 配置信息容器
- `.device-label-config-item` - 配置项
- `.device-label-config-key` - 配置键
- `.device-label-config-value` - 配置值
