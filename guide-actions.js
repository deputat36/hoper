import { bookmarkKey, stopKey, readIds, writeIds } from './trip.js';

const buttons = [...document.querySelectorAll('[data-guide-trip], [data-guide-plan], [data-guide-save]')];
const storage = () => localStorage;
const toast = document.getElementById('guide-toast');
let timer;

function idsFor(button) {
  return (button.dataset.guidePlan || button.dataset.guideTrip || button.dataset.guideSave).split(',');
}

function keyFor(button) {
  return button.dataset.guideSave ? bookmarkKey : stopKey;
}

function sync() {
  for (const button of buttons) {
    const ids = readIds(storage, keyFor(button));
    const selected = idsFor(button).every(id => ids.includes(id));
    const label = button.querySelector('span');
    button.hidden = false;
    if (button.dataset.guidePlan) {
      button.disabled = selected;
      label.textContent = selected ? 'Остановки добавлены' : 'Добавить остановки';
    } else {
      button.setAttribute('aria-pressed', String(selected));
      if (button.dataset.guideSave) {
        const title = selected ? 'Убрать из избранного' : 'В избранное';
        button.title = title;
        button.setAttribute('aria-label', title);
      } else {
        label.textContent = selected ? 'В маршруте' : 'В маршрут';
      }
    }
  }
}

for (const button of buttons) {
  button.addEventListener('click', () => {
    const key = keyFor(button);
    const before = readIds(storage, key);
    const ids = idsFor(button);
    const remove = !button.dataset.guidePlan && before.includes(ids[0]);
    const after = remove ? before.filter(id => id !== ids[0]) : [...new Set([...before, ...ids])];
    let message = 'Браузер не сохранил список';
    if (writeIds(storage, key, after)) {
      sync();
      if (button.dataset.guideSave) message = remove ? 'Место убрано из избранного' : 'Место в избранном';
      else message = remove ? 'Остановка убрана' : 'Остановка добавлена в план';
    }
    toast.textContent = message;
    toast.hidden = false;
    clearTimeout(timer);
    timer = setTimeout(() => { toast.hidden = true; }, 2200);
  });
}
window.addEventListener('storage', sync);
window.addEventListener('pageshow', sync);
sync();
