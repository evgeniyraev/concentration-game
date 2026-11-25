const MAX_MINUTES = 1440;
const MAX_POINTS = 24;
const PLOT = { left: 70, bottom: 210, width: 540, height: 180 };
const SVG_NS = 'http://www.w3.org/2000/svg';

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function numberField(value, max) {
  const input = document.createElement('input');
  input.type = 'number';
  input.required = true;
  input.min = '0';
  input.max = String(max);
  input.step = '1';
  input.value = String(value);
  return input;
}

export function mountChanceEditor() {
  const list = document.querySelector('#chance-points');
  const add = document.querySelector('#add-chance-point');
  const error = document.querySelector('#chance-error');
  const chart = document.querySelector('#chance-chart');
  const line = document.querySelector('#chance-line');
  const markers = document.querySelector('#chance-markers');
  const midLabel = document.querySelector('#chance-mid-label');
  const maxLabel = document.querySelector('#chance-max-label');
  const rows = [];
  let axisMax = 25;
  let drag;

  function readPoints() {
    return rows.map(({ minute, percent }, index) => ({
      minute: minute.valueAsNumber,
      percent: percent.valueAsNumber,
      index
    })).sort((left, right) => left.minute - right.minute);
  }

  function getPoints() {
    const points = readPoints();
    if (!points.length) return null;
    let message = '';
    if (points.some(({ minute, percent }) =>
      !Number.isInteger(minute) || minute < 0 || minute > MAX_MINUTES ||
      !Number.isInteger(percent) || percent < 0 || percent > 100
    )) {
      message = 'Enter whole minutes from 0 to 1,440 and percentages from 0 to 100.';
    } else if (points.some((point, index) => point.minute === points[index - 1]?.minute)) {
      message = 'Use a different minute for each point.';
    }
    error.textContent = message;
    if (message) return null;
    return points.map(({ minute, percent }) => ({ minute, percent }));
  }

  function draw() {
    const valid = getPoints();
    add.disabled = !valid || rows.length >= MAX_POINTS;
    if (!valid) return;
    const points = readPoints();
    const [first] = points;
    const last = points.at(-1);
    if (!drag) {
      axisMax = Math.min(MAX_MINUTES, Math.max(20, last.minute + Math.max(5, Math.ceil(last.minute / 5))));
    }
    midLabel.textContent = String(axisMax / 2);
    maxLabel.textContent = `${axisMax} min`;
    const coordinates = points.map(({ minute, percent }) => [
      PLOT.left + minute / axisMax * PLOT.width,
      PLOT.bottom - percent / 100 * PLOT.height
    ]);
    line.setAttribute('points', [
      [PLOT.left, coordinates[0][1]],
      ...coordinates,
      [PLOT.left + PLOT.width, coordinates.at(-1)[1]]
    ].map((pair) => pair.join(',')).join(' '));

    markers.replaceChildren(...coordinates.map(([x, y], index) => {
      const point = points[index];
      const marker = document.createElementNS(SVG_NS, 'circle');
      marker.setAttribute('class', 'chance-marker');
      marker.setAttribute('cx', x);
      marker.setAttribute('cy', y);
      marker.setAttribute('r', 8);
      marker.dataset.point = point.index;
      const title = document.createElementNS(SVG_NS, 'title');
      title.textContent = `${point.minute} min, ${point.percent}%`;
      marker.append(title);
      return marker;
    }));
    chart.setAttribute('aria-label',
      `Reward chance by elapsed minute, from ${first.percent}% to ${last.percent}%`);
  }

  function labelRows() {
    rows.forEach(({ minute, percent, remove }, index) => {
      const label = `Point ${index + 1}`;
      minute.setAttribute('aria-label', `${label} elapsed minutes`);
      percent.setAttribute('aria-label', `${label} chance percent`);
      remove.setAttribute('aria-label', `Remove ${label.toLowerCase()}`);
      remove.disabled = rows.length === 1;
    });
  }

  function insertPoint(point, index = rows.length) {
    const element = document.createElement('div');
    element.className = 'chance-point-row';
    const minute = numberField(point.minute, MAX_MINUTES);
    const percent = numberField(point.percent, 100);
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'icon';
    remove.textContent = '×';
    const row = { element, minute, percent, remove };
    remove.addEventListener('click', () => {
      const rowIndex = rows.indexOf(row);
      rows.splice(rowIndex, 1);
      element.remove();
      labelRows();
      draw();
      rows[Math.min(rowIndex, rows.length - 1)].minute.focus();
    });
    element.append(minute, percent, remove);
    list.insertBefore(element, rows[index]?.element ?? null);
    rows.splice(index, 0, row);
    return row;
  }

  add.addEventListener('click', () => {
    const points = readPoints();
    let largestGap = 1;
    let nextPoint;
    let insertAt;
    for (let index = 1; index < points.length; index += 1) {
      const previous = points[index - 1];
      const next = points[index];
      const gap = next.minute - previous.minute;
      if (gap <= largestGap) continue;
      largestGap = gap;
      const offset = Math.floor(gap / 2);
      nextPoint = {
        minute: previous.minute + offset,
        percent: Math.round(previous.percent + offset / gap * (next.percent - previous.percent))
      };
      insertAt = next.index;
    }
    if (!nextPoint) {
      const last = points.at(-1);
      nextPoint = last.minute < MAX_MINUTES
        ? { minute: Math.min(MAX_MINUTES, last.minute + 5), percent: last.percent }
        : { minute: points[0].minute - 1, percent: points[0].percent };
    }
    const row = insertPoint(nextPoint, insertAt);
    labelRows();
    draw();
    row.minute.focus();
  });

  list.addEventListener('input', draw);
  chart.addEventListener('pointerdown', (event) => {
    const marker = event.target.closest('.chance-marker');
    if (event.button !== 0 || !marker || drag || !getPoints()) return;
    const points = readPoints();
    const index = points.findIndex((point) => point.index === Number(marker.dataset.point));
    drag = {
      id: event.pointerId,
      row: rows[points[index].index],
      min: index > 0 ? points[index - 1].minute + 1 : 0,
      max: index < points.length - 1 ? points[index + 1].minute - 1 : axisMax
    };
    chart.setPointerCapture(event.pointerId);
    chart.classList.add('dragging');
    event.preventDefault();
  });
  chart.addEventListener('pointermove', (event) => {
    if (drag?.id !== event.pointerId) return;
    const transform = chart.getScreenCTM();
    if (!transform) return;
    const location = new DOMPoint(event.clientX, event.clientY).matrixTransform(transform.inverse());
    const minute = Math.round((location.x - PLOT.left) / PLOT.width * axisMax);
    const percent = Math.round((PLOT.bottom - location.y) / PLOT.height * 100);
    drag.row.minute.value = String(clamp(minute, drag.min, drag.max));
    drag.row.percent.value = String(clamp(percent, 0, 100));
    draw();
  });
  chart.addEventListener('lostpointercapture', (event) => {
    if (drag?.id !== event.pointerId) return;
    drag = undefined;
    chart.classList.remove('dragging');
    draw();
  });

  return {
    getPoints,
    load(points) {
      drag = undefined;
      chart.classList.remove('dragging');
      list.replaceChildren();
      rows.length = 0;
      for (const point of points) insertPoint(point);
      labelRows();
      draw();
    }
  };
}
