// ============ 连接 MetaMask 钱包 ============

// 收款地址(以后你自己的钱包地址会放在这里)
const RECEIVER_ADDRESS = "0x0000000000000000000000000000000000dEaD";

async function connectWallet() {
  const statusBox = document.getElementById("walletStatusBox");

  if (typeof window.ethereum === "undefined") {
    statusBox.innerText = "没有检测到 MetaMask,请先安装浏览器插件。";
    window.open("https://metamask.io/download/", "_blank");
    return;
  }

  try {
    const accounts = await window.ethereum.request({
      method: "eth_requestAccounts",
    });
    const address = accounts[0];
    const short = address.slice(0, 6) + "..." + address.slice(-4);
    statusBox.innerText = "已连接: " + short;
  } catch (err) {
    statusBox.innerText = "连接失败: " + err.message;
  }
}

window.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("connectWalletBtn");
  if (btn) {
    btn.addEventListener("click", connectWallet);
  }
});
