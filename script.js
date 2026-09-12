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

// 钱包连接相关
const connectBtn = document.getElementById('connectWallet');
const connectBtn2 = document.getElementById('connectWallet2');
const disconnectBtn = document.getElementById('disconnectWallet');
const walletStatus = document.getElementById('walletStatus');
const walletDetail = document.getElementById('walletDetail');

let currentAccount = null;

function shortAddress(addr) {
  return addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : '';
}

function updateUI(account) {
  currentAccount = account;
  if (account) {
    connectBtn.textContent = shortAddress(account);
    connectBtn.classList.add('connected');
    connectBtn2.style.display = 'none';
    disconnectBtn.style.display = 'inline-block';
    walletStatus.textContent = `已连接：${shortAddress(account)}`;
    walletDetail.textContent = `已连接钱包：${account}`;
  } else {
    connectBtn.textContent = '连接钱包';
    connectBtn.classList.remove('connected');
    connectBtn2.style.display = 'inline-block';
    disconnectBtn.style.display = 'none';
    walletStatus.textContent = '';
    walletDetail.textContent = '尚未连接。点击右上角「连接钱包」开始。';
  }
}

async function connectWallet() {
  if (typeof window.ethereum === 'undefined') {
    alert('请先安装 MetaMask 钱包插件');
    return;
  }
  try {
    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
    if (accounts.length > 0) {
      updateUI(accounts[0]);
    }
  } catch (err) {
    console.error(err);
    alert('连接失败，请重试');
  }
}

function disconnectWallet() {
  updateUI(null);
}

if (connectBtn) connectBtn.addEventListener('click', connectWallet);
if (connectBtn2) connectBtn2.addEventListener('click', connectWallet);
if (disconnectBtn) disconnectBtn.addEventListener('click', disconnectWallet);

// 页面加载时检查是否已连接
if (typeof window.ethereum !== 'undefined') {
  window.ethereum.request({ method: 'eth_accounts' }).then(accounts => {
    if (accounts.length > 0) updateUI(accounts[0]);
  });

  window.ethereum.on('accountsChanged', accounts => {
    updateUI(accounts.length > 0 ? accounts[0] : null);
  });
}
