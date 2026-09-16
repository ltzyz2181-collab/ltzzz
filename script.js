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

// ========== 钱包连接（仅观察：地址 + 余额） ==========
const connectBtn = document.getElementById('connectWallet');
const connectBtn2 = document.getElementById('connectWallet2');
const disconnectBtn = document.getElementById('disconnectWallet');
const walletStatus = document.getElementById('walletStatus');
const walletDetail = document.getElementById('walletDetail');

let currentAccount = null;
let provider = null;

function isMobile() {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || window.innerWidth < 768;
}

function shortAddress(addr) {
  return addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : '';
}

function getProvider() {
  if (window.okxwallet) return window.okxwallet;
  if (window.ethereum) return window.ethereum;
  return null;
}

function showNoWalletHelp() {
  const mobile = isMobile();
  let msg = '未检测到钱包注入。\n\n';
  if (mobile) {
    msg +=
      '【手机端】普通浏览器通常没有钱包插件。\n' +
      '请任选其一：\n' +
      '1. 打开 MetaMask App 或 欧易 OKX App，用「应用内浏览器」打开本站\n' +
      '2. 电脑浏览器安装 MetaMask / OKX 扩展后再试\n' +
      '3. 使用支持 WalletConnect 的钱包 App（本页以 App 内置浏览器为主）\n\n' +
      '本站只读取地址与余额。';
  } else {
    msg +=
      '【电脑端】请安装并解锁 MetaMask 或 欧易 OKX 浏览器扩展，然后刷新本页再点「连接钱包」。\n\n' +
      '本站只读取地址与余额。';
  }
  alert(msg);
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
    loadBalances(account);
  } else {
    if (connectBtn) {
      connectBtn.textContent = '连接钱包';
      connectBtn.classList.remove('connected');
    }
    if (connectBtn2) connectBtn2.style.display = 'inline-block';
    if (disconnectBtn) disconnectBtn.style.display = 'none';
    if (walletStatus) walletStatus.textContent = '';
    if (walletDetail) {
      walletDetail.textContent = isMobile()
        ? '手机请用 MetaMask / OKX App 内置浏览器打开本站后再连接。'
        : '尚未连接。点击右上角「连接钱包」（支持 MetaMask / 欧易 OKX）。';
    }
    if (walletBalancesEl) walletBalancesEl.style.display = 'none';
    if (ethBalanceEl) ethBalanceEl.textContent = '--';
    if (usdtBalanceEl) usdtBalanceEl.textContent = '--';
  }
}

async function connectWallet() {
  provider = getProvider();
  if (!provider) {
    showNoWalletHelp();
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
      alert('连接失败，请重试。若在手机，请用钱包 App 内置浏览器打开本站。');
    }
  }
}

function disconnectWallet() {
  updateUI(null);
}

if (connectBtn) connectBtn.addEventListener('click', connectWallet);
if (connectBtn2) connectBtn2.addEventListener('click', connectWallet);
if (disconnectBtn) disconnectBtn.addEventListener('click', disconnectWallet);

const walletBalancesEl = document.getElementById('walletBalances');
const ethBalanceEl = document.getElementById('ethBalance');
const usdtBalanceEl = document.getElementById('usdtBalance');
const refreshBalancesBtn = document.getElementById('refreshBalances');

const USDT_CONTRACT = '0xdAC17F958D2ee523a2206206994597C13D831ec7';

function hexToDecimal(hex, decimals) {
  try {
    const raw = BigInt(hex);
    const divisor = 10n ** BigInt(decimals);
    const intPart = raw / divisor;
    const fracPart = raw % divisor;
    const fracStr = fracPart.toString().padStart(decimals, '0').replace(/0+$/, '');
    const frac = fracStr ? fracStr.slice(0, 4) : '0';
    return `${intPart}.${frac}`;
  } catch (e) {
    return '--';
  }
}

async function loadBalances(account) {
  if (!provider || !account) return;
  if (walletBalancesEl) walletBalancesEl.style.display = 'flex';
  if (ethBalanceEl) ethBalanceEl.textContent = '读取中…';
  if (usdtBalanceEl) usdtBalanceEl.textContent = '读取中…';
  try {
    const [ethWei, usdtRaw] = await Promise.all([
      provider.request({ method: 'eth_getBalance', params: [account, 'latest'] }),
      provider.request({
        method: 'eth_call',
        params: [{ to: USDT_CONTRACT, data: '0x70a08231' + account.slice(2).toLowerCase().padStart(64, '0') }, 'latest'],
      }),
    ]);
    if (ethBalanceEl) ethBalanceEl.textContent = hexToDecimal(ethWei, 18);
    if (usdtBalanceEl) usdtBalanceEl.textContent = hexToDecimal(usdtRaw, 6);
  } catch (e) {
    if (ethBalanceEl) ethBalanceEl.textContent = '读取失败';
    if (usdtBalanceEl) usdtBalanceEl.textContent = '读取失败';
  }
}

if (refreshBalancesBtn) refreshBalancesBtn.addEventListener('click', () => loadBalances(currentAccount));

(async function initWallet() {
  provider = getProvider();
  if (!provider) {
    if (walletDetail && isMobile()) {
      walletDetail.textContent = '手机请用 MetaMask / OKX App 内置浏览器打开本站后再连接。';
    }
    return;
  }
  try {
    const accounts = await provider.request({ method: 'eth_accounts' });
    if (accounts && accounts.length > 0) updateUI(accounts[0]);
  } catch (e) {}
  if (provider.on) {
    provider.on('accountsChanged', accounts => {
      updateUI(accounts && accounts.length > 0 ? accounts[0] : null);
    });
  }
})();
