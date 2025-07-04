# 地面着色器实现总结

## 概述

为室内子系统实现了基于 GLSL 着色器的动态地面效果，包括动态网格动画、抗锯齿处理和自动尺寸调整。最新版本基于 `扩大.glsl` 实现了动态线网格效果，并进行了柔和优化。

## 主要功能

### 1. 动态线网格着色器（最新 - 柔和版本）

- 基于 `扩大.glsl` 实现
- 使用 SDF（有向距离场）技术绘制网格线
- 动态网格点动画和波浪效果
- RGB 通道分离产生彩色效果
- 伽马校正确保正确的颜色空间
- **柔和优化**：消除明显边界，扩大影响范围

### 2. 自动尺寸调整

- 根据模型包围盒自动计算地面尺寸
- 默认添加 20%的边距
- 支持动态重新计算

### 3. 抗锯齿处理

- 使用 smoothstep 函数实现平滑过渡
- 边缘渐变效果
- 减少采样伪影

### 4. 地面重新计算功能

- 每次加载新模型时自动重新计算地面范围
- 清理旧地面资源，避免内存泄漏
- 根据新模型的包围盒调整地面尺寸和位置

## 实现细节

### SpecialGround 类

```javascript
class SpecialGround extends THREE.Mesh {
  constructor(center, min, boundingBox = null) {
    // 根据包围盒计算地面尺寸
    const size = boundingBox
      ? boundingBox.getSize(new THREE.Vector3())
      : new THREE.Vector3(100, 1, 100);
    const groundWidth = size.x * 1.2; // 20%边距
    const groundDepth = size.z * 1.2;

    // 计算地面位置
    const groundCenter = boundingBox
      ? boundingBox.getCenter(new THREE.Vector3())
      : center;
    const groundY = boundingBox ? boundingBox.min.y - 1 : min.y - 1;

    // 创建几何体和材质
    const geometry = new THREE.PlaneGeometry(groundWidth, groundDepth);
    const material = createGroundShaderMaterial();

    super(geometry, material);

    // 设置位置和旋转
    this.position.set(groundCenter.x, groundY, groundCenter.z);
    this.rotation.x = -Math.PI / 2;
  }
}
```

### 扩大着色器特性（柔和版本）

```glsl
// 核心算法
float sdOrientedBox(in vec2 p, in vec2 a, in vec2 b, float th) {
  float l = length(b - a);
  vec2 d = (b - a) / l;
  vec2 q = (p - (a + b) * 0.5);
  q = mat2(d.x, -d.y, d.y, d.x) * q;
  q = abs(q) - vec2(l, th) * 0.5;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
}

// 动态网格点（柔和版本）
vec2 getGridPoint(vec2 id) {
  float t = float(uFrame) * 0.001;
  float d = smoothstep(scl * 0.5, 0.0, length(id)); // 扩大影响范围
  float theta = tau * (t + 731.154 * hash12(id));
  float x = d * 0.3 * cos(theta); // 减小振幅
  float y = d * 0.3 * sin(theta);
  vec2 wave = (1.0 - d) * 0.02 * id * sin(length(id) - t * scl * 0.5); // 减小波浪强度
  return vec2(x, y) + wave;
}

// 柔和边缘处理
void main() {
  // ... 渲染逻辑 ...

  // 更柔和的边缘处理，扩大范围
  float edge = smoothstep(0.0, 0.05, 1.0 - length(vUv - 0.5) * 1.5);
  col *= edge;

  // 添加全局渐变，让效果更自然
  float globalFade = smoothstep(0.0, 0.3, 1.0 - length(vUv - 0.5) * 1.2);
  col *= globalFade;

  gl_FragColor = vec4(gammaCorrection(col), 0.4);
}
```

### IndoorSubsystem 集成

```javascript
// 重新创建地面方法
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

  // 创建新的地面
  this.createGround(param.center, param.min);
}

// 在模型加载完成后调用
onLoaded() {
  // 重新计算地面范围
  this.recreateGround();
  // ... 其他初始化代码
}
```

### 着色器 Uniform 变量

- `uTime`: 时间变量，用于动画
- `uResolution`: 分辨率，用于坐标转换
- `uFrame`: 帧数，用于网格点动画

## 柔和优化详情

### 主要改进

1. **网格密度调整**: 从 15.0 降低到 8.0，让效果更分散
2. **边缘处理优化**: 使用双重渐变，消除硬边界
3. **线条厚度调整**: 从 0.05 降低到 0.03，更细腻
4. **动画强度减弱**: 减小振幅和波浪强度
5. **透明度调整**: 从 0.6 降低到 0.4，更柔和

### 技术参数对比

| 参数           | 原始版本 | 柔和版本 | 效果             |
| -------------- | -------- | -------- | ---------------- |
| 网格密度 (scl) | 15.0     | 8.0      | 更分散的效果     |
| 线条厚度       | 0.05     | 0.03     | 更细腻的线条     |
| 边缘范围       | 1.5      | 2.0      | 更大的影响范围   |
| 动画振幅       | 0.4      | 0.3      | 更柔和的动画     |
| 波浪强度       | 0.03     | 0.02     | 更自然的波动     |
| 透明度         | 0.6      | 0.4      | 更柔和的视觉效果 |

## 测试文件

- `test_soft_shader.html`: 测试柔和着色器效果
- `test_expand_shader.html`: 测试原始扩大着色器效果
- `test_ground_recalculation.html`: 测试地面重新计算功能
- `test_antialiasing.html`: 测试抗锯齿效果
- `test_ground_size.html`: 测试地面尺寸调整

## 使用说明

1. 每次加载新模型时，地面会自动重新计算
2. 地面尺寸基于模型包围盒，自动添加 20%边距
3. 地面位置设置在模型底部，稍微降低 Y 坐标
4. 支持实时动画和抗锯齿效果
5. 新的扩大着色器提供动态线网格效果
6. **柔和版本**消除了明显的圆形边界，效果更自然

## 技术特点

### SDF 技术

- 使用有向距离场绘制平滑线条
- 支持任意方向的线条绘制
- 高质量的抗锯齿效果

### 动态动画

- 基于时间的网格点运动
- 波浪效果增强视觉表现
- 颜色偏移产生立体感

### 性能优化

- 高效的哈希函数
- 优化的距离计算
- 合理的网格密度

### 柔和优化

- 双重边缘渐变处理
- 扩大的影响范围
- 更自然的视觉效果
- 消除明显的边界感

## 注意事项

- 确保在清理场景时正确释放地面资源
- 地面材质使用透明效果，需要正确的渲染顺序
- 包围盒计算基于模型的 equip 组
- 新的着色器需要 uFrame uniform 支持动画
- 柔和版本适合更自然的视觉效果需求
