<script>
  import { t } from "./i18n/i18n";

  let {
    points = [],
    formatValue = (value) => String(value ?? 0),
    timezoneOffsetMs = 8 * 60 * 60 * 1000,
  } = $props();

  const chart = {
    width: 260,
    height: 62,
    left: 8,
    right: 252,
    top: 8,
    bottom: 56,
  };

  let hoverIndex = $state(null);
  let pinnedIndex = $state(null);
  let safePoints = $derived((points || []).filter((point) => (
    Number.isFinite(Number(point?.current)) && Number.isFinite(Number(point?.previous))
  )));
  let maxValue = $derived(Math.max(
    1,
    ...safePoints.flatMap((point) => [Number(point.current || 0), Number(point.previous || 0)]),
  ));
  let activeIndex = $derived(clampIndex(pinnedIndex ?? hoverIndex ?? (safePoints.length - 1)));
  let currentPolyline = $derived(pointsFor("current"));
  let previousPolyline = $derived(pointsFor("previous"));
  let activePoint = $derived(safePoints[activeIndex] || null);
  let activeCurrentPoint = $derived(activePoint ? pointFor(Number(activePoint.current || 0), activeIndex) : null);
  let activePreviousPoint = $derived(activePoint ? pointFor(Number(activePoint.previous || 0), activeIndex) : null);
  let tooltipLeft = $derived(activeCurrentPoint ? Math.min(Math.max((activeCurrentPoint.x / chart.width) * 100, 18), 82) : 50);
  let cutoffTime = $derived(cutoffTimeLabel());

  let pinned = $derived(pinnedIndex !== null);

  function clampIndex(index) {
    if (!safePoints.length) return -1;
    if (!Number.isFinite(Number(index))) return safePoints.length - 1;
    return Math.min(safePoints.length - 1, Math.max(0, Number(index)));
  }

  function setVisibleIndex(index) {
    const nextIndex = clampIndex(index);
    if (pinnedIndex !== null) {
      pinnedIndex = nextIndex;
    } else {
      hoverIndex = nextIndex;
    }
  }

  function pointFor(value, index) {
    const x = safePoints.length <= 1
      ? (chart.left + chart.right) / 2
      : chart.left + ((chart.right - chart.left) * index) / (safePoints.length - 1);
    const y = chart.bottom - ((chart.bottom - chart.top) * value) / maxValue;
    return { x, y };
  }

  function pointsFor(key) {
    return safePoints
      .map((point, index) => {
        const plotted = pointFor(Number(point[key] || 0), index);
        return `${plotted.x},${plotted.y}`;
      })
      .join(" ");
  }

  function setActiveFromPointer(event) {
    if (!safePoints.length) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    setVisibleIndex(Math.round(ratio * (safePoints.length - 1)));
  }

  function togglePinned(event) {
    event.preventDefault();
    event.stopPropagation();
    if (pinnedIndex !== null) {
      pinnedIndex = null;
      return;
    }
    setActiveFromPointer(event);
    pinnedIndex = activeIndex;
  }

  function clearPointer() {
    if (!pinned) hoverIndex = null;
  }

  function handleKeydown(event) {
    if (!safePoints.length) return;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      setVisibleIndex(activeIndex - 1);
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      setVisibleIndex(activeIndex + 1);
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      pinnedIndex = pinnedIndex === null ? activeIndex : null;
    }
    if (event.key === "Escape") {
      pinnedIndex = null;
    }
  }

  function differenceText(point) {
    const previous = Number(point?.previous || 0);
    const current = Number(point?.current || 0);
    if (!previous) return current ? "+100%" : "0%";
    const percent = Math.round(((current - previous) / previous) * 100);
    return `${percent > 0 ? "+" : ""}${percent}%`;
  }

  function reportTimeLabel(value) {
    const date = value instanceof Date ? value : new Date(value);
    if (!Number.isFinite(date.getTime())) return "";
    return new Date(date.getTime() + timezoneOffsetMs).toISOString().slice(11, 16);
  }

  function nextHourLabel(label) {
    const [hour, minute] = String(label || "").split(":").map(Number);
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) return "";
    const nextMinutes = (hour * 60 + minute + 60) % (24 * 60);
    return `${String(Math.floor(nextMinutes / 60)).padStart(2, "0")}:${String(nextMinutes % 60).padStart(2, "0")}`;
  }

  function cutoffTimeLabel() {
    const lastPoint = safePoints[safePoints.length - 1];
    return reportTimeLabel(lastPoint?.currentEndAt) || nextHourLabel(lastPoint?.hourLabel);
  }
</script>

{#if safePoints.length}
  <button
    class="hourly-sparkline"
    type="button"
    aria-label={$t("Hourly comparison trend")}
    onpointermove={setActiveFromPointer}
    onpointerleave={clearPointer}
    onclick={togglePinned}
    onkeydown={handleKeydown}
  >
    {#if cutoffTime}
      <span class="hourly-cutoff">{$t("Through {{time}}", { time: cutoffTime })}</span>
    {/if}
    <svg class="hourly-chart" viewBox="0 0 260 62" aria-hidden="true">
      <polyline class="hourly-line previous" points={previousPolyline}></polyline>
      <polyline class="hourly-line current" points={currentPolyline}></polyline>
      {#if activePoint && activeCurrentPoint && activePreviousPoint}
        <line class="hourly-guide" x1={activeCurrentPoint.x} x2={activeCurrentPoint.x} y1="8" y2="56"></line>
        <circle class="hourly-point previous" cx={activePreviousPoint.x} cy={activePreviousPoint.y} r="5"></circle>
        <circle class="hourly-point current" cx={activeCurrentPoint.x} cy={activeCurrentPoint.y} r="5"></circle>
      {/if}
    </svg>
    {#if activePoint}
      <div class="hourly-tooltip" style={`left: ${tooltipLeft}%`} role="status" aria-live="polite">
        <div class="tooltip-hour">{activePoint.hourLabel}</div>
        <div class="tooltip-row current"><span>{$t("Selected date")}</span><strong>{formatValue(activePoint.current)}</strong></div>
        <div class="tooltip-row previous"><span>{$t("Yesterday same hours")}</span><strong>{formatValue(activePoint.previous)}</strong></div>
        <div class="tooltip-row delta"><span>{$t("Difference")}</span><strong>{differenceText(activePoint)}</strong></div>
      </div>
    {/if}
  </button>
  <div class="hourly-legend">
    <span>{$t("Selected date")}</span>
    <span>{$t("Yesterday same hours")}</span>
  </div>
{/if}
