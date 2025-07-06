// 纹理清理测试脚本
// 用于验证室内场景切换时的纹理单元清理是否有效

function testTextureCleanup() {
  console.log("=== 开始纹理清理测试 ===");

  // 模拟频繁的场景切换
  const testScenes = ["制冷", "制热", "配电", "地面"];
  let currentIndex = 0;
  let switchCount = 0;

  const testInterval = setInterval(() => {
    const scene = testScenes[currentIndex];
    switchCount++;
    console.log(`第 ${switchCount} 次切换，切换到场景: ${scene}`);

    // 发送场景切换消息
    window.postMessage(
      {
        cmd: "changeScene",
        param: scene,
      },
      "*"
    );

    currentIndex = (currentIndex + 1) % testScenes.length;

    // 每5次切换后检查资源使用情况
    if (switchCount % 5 === 0) {
      setTimeout(() => {
        if (window.Core && window.Core.logWebGLResources) {
          console.log(`=== 第 ${switchCount} 次切换后的资源使用情况 ===`);
          window.Core.logWebGLResources();
        }
      }, 1000);
    }

    // 每10次切换后强制清理一次
    if (switchCount % 10 === 0) {
      setTimeout(() => {
        if (window.Core && window.Core.forceCleanupWebGLResources) {
          console.log(`=== 第 ${switchCount} 次切换后执行强制清理 ===`);
          window.Core.forceCleanupWebGLResources();
        }
      }, 1500);
    }
  }, 3000); // 每3秒切换一次

  // 60秒后停止测试
  setTimeout(() => {
    clearInterval(testInterval);
    console.log("=== 测试完成 ===");

    if (window.Core && window.Core.logWebGLResources) {
      console.log("=== 最终资源使用情况 ===");
      window.Core.logWebGLResources();
    }
  }, 60000);
}

// 添加强制清理按钮
function addForceCleanupButton() {
  const button = document.createElement("button");
  button.textContent = "强制清理WebGL资源";
  button.style.position = "fixed";
  button.style.top = "50px";
  button.style.right = "10px";
  button.style.zIndex = "10000";
  button.style.padding = "10px";
  button.style.backgroundColor = "#dc3545";
  button.style.color = "white";
  button.style.border = "none";
  button.style.borderRadius = "5px";
  button.style.cursor = "pointer";
  button.style.marginBottom = "10px";

  button.onclick = () => {
    if (window.Core && window.Core.forceCleanupWebGLResources) {
      window.Core.forceCleanupWebGLResources();
    } else {
      console.log("Core 实例或强制清理方法不可用");
    }
  };

  document.body.appendChild(button);
}

// 添加资源监控按钮
function addMonitorButton() {
  const button = document.createElement("button");
  button.textContent = "监控WebGL资源";
  button.style.position = "fixed";
  button.style.top = "90px";
  button.style.right = "10px";
  button.style.zIndex = "10000";
  button.style.padding = "10px";
  button.style.backgroundColor = "#28a745";
  button.style.color = "white";
  button.style.border = "none";
  button.style.borderRadius = "5px";
  button.style.cursor = "pointer";

  button.onclick = () => {
    if (window.Core && window.Core.logWebGLResources) {
      window.Core.logWebGLResources();
    } else {
      console.log("Core 实例或资源监控方法不可用");
    }
  };

  document.body.appendChild(button);
}

// 添加测试按钮到页面
function addTestButton() {
  const button = document.createElement("button");
  button.textContent = "开始纹理清理测试";
  button.style.position = "fixed";
  button.style.top = "10px";
  button.style.right = "10px";
  button.style.zIndex = "10000";
  button.style.padding = "10px";
  button.style.backgroundColor = "#007bff";
  button.style.color = "white";
  button.style.border = "none";
  button.style.borderRadius = "5px";
  button.style.cursor = "pointer";

  button.onclick = testTextureCleanup;

  document.body.appendChild(button);

  // 添加其他按钮
  addForceCleanupButton();
  addMonitorButton();
}

// 页面加载完成后添加测试按钮
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", addTestButton);
} else {
  addTestButton();
}

console.log("纹理清理测试脚本已加载");
console.log("点击右上角的按钮开始测试");
console.log("红色按钮：强制清理WebGL资源");
console.log("绿色按钮：监控WebGL资源使用情况");
