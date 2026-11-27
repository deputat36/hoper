const archive = document.getElementById('afisha-archive');
const upcomingList = document.getElementById('afisha-upcoming');
const archiveList = archive.querySelector('ul');
const empty = document.getElementById('afisha-empty');

function updateCalendar() {
  const now = Date.now();
  for (const item of [...upcomingList.children]) {
    const start = Date.parse(item.querySelector('time').dateTime);
    if (start <= now) archiveList.prepend(item);
  }
  archive.hidden = !archiveList.childElementCount;
  empty.hidden = Boolean(upcomingList.childElementCount);
}

updateCalendar();
window.addEventListener('pageshow', updateCalendar);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) updateCalendar();
});
