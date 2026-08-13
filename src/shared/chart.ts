// Мінімальний графік на SVG — без бібліотек.
//
// Chart.js додав би ~200 КБ у бандл заради одного графіка й зламав би принцип
// «нуль runtime-залежностей» (у package.json лише typescript + esbuild у devDeps).
// Стовпчики за днями — рівно те, що потрібно для активності; крива тут нічого
// не додала б, бо дані дискретні (події за добу).
//
// SVG будується через createElementNS (не innerHTML): значення приходять із
// бекенду, і вставляти їх у розмітку рядком означало б ризик ін'єкції.

const NS = 'http://www.w3.org/2000/svg';

export interface ChartSeries {
  key: string;
  label: string;
  color: string;
  values: number[];
}

export interface ChartData {
  labels: string[]; // ISO-дати, по одній на стовпчик
  series: ChartSeries[];
}

function el<K extends keyof SVGElementTagNameMap>(
  name: K,
  attrs: Record<string, string | number>
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attrs)) {
    node.setAttribute(key, String(value));
  }
  return node;
}

function formatDay(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return `${d.getDate()}.${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function renderChart(svg: SVGSVGElement, data: ChartData): void {
  const width = svg.clientWidth || 880;
  const height = svg.clientHeight || 260;
  const padLeft = 38;
  const padBottom = 26;
  const padTop = 12;

  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.textContent = '';

  const count = data.labels.length;
  if (count === 0) return;

  const plotW = width - padLeft - 10;
  const plotH = height - padTop - padBottom;

  // Максимум по ВСІХ серіях: інакше при перемиканні фільтра масштаб стрибав би,
  // і візуально однакові стовпчики означали б різні числа.
  const max = Math.max(1, ...data.series.flatMap((s) => s.values));

  // Горизонтальна сітка + підписи осі значень (3 рівні достатньо для читання).
  for (let i = 0; i <= 2; i++) {
    const value = Math.round((max / 2) * i);
    const y = padTop + plotH - (value / max) * plotH;

    svg.appendChild(el('line', {
      x1: padLeft, y1: y, x2: width - 10, y2: y,
      stroke: 'rgba(255,255,255,.07)', 'stroke-width': 1
    }));

    const label = el('text', {
      x: padLeft - 8, y: y + 4, 'text-anchor': 'end',
      fill: 'rgba(255,255,255,.42)', 'font-size': 10
    });
    label.textContent = String(value);
    svg.appendChild(label);
  }

  const slot = plotW / count;
  const visible = data.series.length;
  const barW = Math.max(2, Math.min(14, (slot - 3) / Math.max(1, visible)));

  data.labels.forEach((iso, i) => {
    data.series.forEach((s, sIdx) => {
      const value = s.values[i] ?? 0;
      if (value === 0) return; // нульові дні лишаємо порожніми, без пласких рисок

      const h = (value / max) * plotH;
      const x = padLeft + i * slot + (slot - barW * visible) / 2 + sIdx * barW;

      const rect = el('rect', {
        x, y: padTop + plotH - h, width: barW, height: h,
        fill: s.color, rx: Math.min(3, barW / 2)
      });
      // Нативна підказка браузера — дешевше за власний тултип і працює з клавіатури.
      const title = document.createElementNS(NS, 'title');
      title.textContent = `${formatDay(iso)} — ${s.label}: ${value}`;
      rect.appendChild(title);
      svg.appendChild(rect);
    });
  });

  // Підписи дат: показуємо не всі, інакше на 90 днях вони злипнуться.
  const step = Math.ceil(count / 10);
  data.labels.forEach((iso, i) => {
    if (i % step !== 0 && i !== count - 1) return;
    const label = el('text', {
      x: padLeft + i * slot + slot / 2, y: height - 8, 'text-anchor': 'middle',
      fill: 'rgba(255,255,255,.42)', 'font-size': 10
    });
    label.textContent = formatDay(iso);
    svg.appendChild(label);
  });
}
