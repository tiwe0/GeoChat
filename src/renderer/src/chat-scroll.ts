export const CHAT_AUTO_SCROLL_BOTTOM_THRESHOLD = 28;

export type ScrollMetrics = {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
};

export function scrollBottomDistance(metrics: ScrollMetrics) {
  return Math.max(0, metrics.scrollHeight - metrics.clientHeight - metrics.scrollTop);
}

export function isScrolledNearBottom(
  metrics: ScrollMetrics,
  threshold = CHAT_AUTO_SCROLL_BOTTOM_THRESHOLD
) {
  return scrollBottomDistance(metrics) <= threshold;
}
