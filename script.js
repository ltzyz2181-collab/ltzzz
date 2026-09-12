// 平滑滚动
document.querySelectorAll('a[href^="#"]').forEach(link => {
  link.addEventListener('click', e => {
    const target = document.querySelector(link.getAttribute('href'));
    if (target) {
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth' });
    }
  });
});

// ========== 钱包连接（支持 MetaMask + 欧易 OKX Web3 钱包） ==========
const connectBtn = document.getElementById('connectWallet');
const connectBtn2 = document.getElementById('connectWallet2');
const disconnectBtn = document.getElementById('disconnectWallet');
const walletStatus = document.getElementById('walletStatus');
const walletDetail = document.getElementById('walletDetail');

let currentAccount = null;
let provider = null;

function shortAddress(addr) {
  return addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : '';
}

function getProvider() {
  // 优先欧易 OKX，其次 MetaMask，再次其他注入的 ethereum
  if (window.okxwallet) return window.okxwallet;
  if (window.ethereum) return window.ethereum;
  return null;
}

function updateUI(account) {
  currentAccount = account;
  if (account) {
    if (connectBtn) {
      connectBtn.textContent = shortAddress(account);
      connectBtn.classList.add('connected');
    }
    if (connectBtn2) connectBtn2.style.display = 'none';
    if (disconnectBtn) disconnectBtn.style.display = 'inline-block';
    if (walletStatus) walletStatus.textContent = `已连接：${shortAddress(account)}`;
    if (walletDetail) walletDetail.textContent = `已连接钱包：${account}`;
  } else {
    if (connectBtn) {
      connectBtn.textContent = '连接钱包';
      connectBtn.classList.remove('connected');
    }
    if (connectBtn2) connectBtn2.style.display = 'inline-block';
    if (disconnectBtn) disconnectBtn.style.display = 'none';
    if (walletStatus) walletStatus.textContent = '';
    if (walletDetail) walletDetail.textContent = '尚未连接。点击右上角「连接钱包」开始（支持 MetaMask / 欧易 OKX）。';
  }
}

async function connectWallet() {
  provider = getProvider();
  if (!provider) {
    alert('未检测到钱包。请安装 MetaMask 或 欧易 OKX Web3 钱包插件后重试。');
    return;
  }
  try {
    const accounts = await provider.request({ method: 'eth_requestAccounts' });
    if (accounts && accounts.length > 0) {
      updateUI(accounts[0]);
    }
  } catch (err) {
    console.error(err);
    if (err.code === 4001) {
      alert('你拒绝了连接请求');
    } else {
      alert('连接失败，请重试');
    }
  }
}

function disconnectWallet() {
  updateUI(null);
}

if (connectBtn) connectBtn.addEventListener('click', connectWallet);
if (connectBtn2) connectBtn2.addEventListener('click', connectWallet);
if (disconnectBtn) disconnectBtn.addEventListener('click', disconnectWallet);

// 页面加载时检查已连接状态
(async function initWallet() {
  provider = getProvider();
  if (!provider) return;
  try {
    const accounts = await provider.request({ method: 'eth_accounts' });
    if (accounts && accounts.length > 0) updateUI(accounts[0]);
  } catch (e) {}

  // 监听账户变化
  if (provider.on) {
    provider.on('accountsChanged', accounts => {
      updateUI(accounts && accounts.length > 0 ? accounts[0] : null);
    });
  }
})();
