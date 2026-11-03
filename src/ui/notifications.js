export function notify(message, type = 'info', timeout = 3000) {
  const region = document.getElementById('toastRegion');
  const toast = document.createElement('div'); toast.className = `toast ${type}`; toast.textContent = message; region.append(toast);
  setTimeout(() => toast.remove(), timeout);
}
