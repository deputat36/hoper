const $ = id => document.getElementById(id);
const form = $('contribution-form');
const topic = $('contribution-topic');
const place = $('contribution-place');
const placeField = $('contribution-place-field');
const name = $('contribution-name');
const nameField = $('contribution-name-field');
const details = $('contribution-message');
const source = $('contribution-source');
const panel = $('contribution-result');
const text = $('contribution-text');
const status = $('contribution-status');
let draft;

const params = new URLSearchParams(location.search);
const choose = (select, value) => {
  if (value && [...select.options].some(option => option.value === value)) select.value = value;
};
choose(topic, params.get('topic'));
choose(place, params.get('place'));

function showFields() {
  const unlisted = topic.value === 'new' || topic.value === 'partner';
  $('contribution-photo-note').hidden = topic.value !== 'description';
  placeField.hidden = unlisted;
  place.disabled = unlisted;
  place.required = !unlisted;
  nameField.hidden = !unlisted;
  name.disabled = !unlisted;
  name.required = unlisted;
}

function discardOutput() {
  panel.hidden = true;
  draft = undefined;
  status.textContent = '';
}

form.addEventListener('input', () => {
  source.setCustomValidity('');
  details.setCustomValidity('');
  name.setCustomValidity('');
  discardOutput();
});
topic.addEventListener('change', showFields);
form.addEventListener('submit', event => {
  event.preventDefault();
  const message = details.value.trim();
  const itemName = name.disabled ? place.selectedOptions[0].textContent : name.value.trim();
  if (!itemName || !message || (!name.disabled && itemName.length < 2) || message.length < 5) {
    const empty = !name.disabled && itemName.length < 2 ? name : details;
    empty.setCustomValidity('Дополните это поле.');
    empty.reportValidity();
    return;
  }
  let evidence = '';
  if (source.value.trim()) {
    let url;
    try {
      url = new URL(source.value.trim());
    } catch {
      // The field-level message below also covers unsupported schemes.
    }
    if (!url || !['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
      source.setCustomValidity('Укажите ссылку, которая начинается с https:// или http://.');
      source.reportValidity();
      return;
    }
    evidence = url.href;
  }
  const id = place.disabled ? '' : place.value;
  const itemUrl = id ? new URL('/mesta/' + id + '/', location.origin).href : '';
  draft = {
    format: 'prikhoperye-contribution-v1', topic: topic.value,
    placeId: id || null, itemName, itemUrl: itemUrl || null,
    details: message, source: evidence || null, createdAt: new Date().toISOString()
  };
  text.value = [
    'Предложение для путеводителя «Прихопёрье»',
    topic.selectedOptions[0].textContent,
    itemName,
    itemUrl,
    '',
    message,
    evidence
  ].filter((line, i) => line || i === 4).join('\n');
  panel.hidden = false;
  $('contribution-result-title').focus();
});

$('contribution-copy').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(text.value);
    status.textContent = 'Текст скопирован.';
  } catch {
    text.focus();
    text.select();
    status.textContent = 'Текст выделен. Скопируйте его из поля.';
  }
});

$('contribution-download').addEventListener('click', () => {
  if (!draft) return;
  const file = new Blob([JSON.stringify(draft, null, 2) + '\n'], {type: 'application/json'});
  const url = URL.createObjectURL(file);
  const download = document.createElement('a');
  download.href = url;
  download.download = 'prikhoperye-' + (draft.placeId || draft.topic) + '.json';
  download.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

showFields();
form.hidden = false;
