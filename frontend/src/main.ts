import './style.css';
import { API_URL } from './config.ts';

const app = document.querySelector<HTMLDivElement>('#app')!;

app.innerHTML = `
  <main>
    <h1>Re:LAX Story Lab</h1>
    <p>場次預約網站建置中。</p>
    <p class="status" id="api-status"></p>
  </main>
`;

// 階段 0：確認前端可連到後端
const status = document.querySelector<HTMLParagraphElement>('#api-status')!;
if (API_URL) {
  fetch(`${API_URL}?action=ping`)
    .then((r) => r.json())
    .then((d) => {
      status.textContent = d.ok ? `後端連線正常（${d.time}）` : '後端回應異常';
    })
    .catch(() => {
      status.textContent = '後端連線失敗';
    });
}
