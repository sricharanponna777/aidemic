/** Converts a pointer event's client coordinates into the coordinate space of the nearest
 * ancestor <svg> (accounting for viewBox scaling), so drag handlers can work in the same
 * data-space units as PlotCanvas's linear scales without manual pixel-ratio math. */
export const svgPointFromEvent = (svg: SVGSVGElement, clientX: number, clientY: number) => {
  const point = svg.createSVGPoint();
  point.x = clientX;
  point.y = clientY;
  const screenCTM = svg.getScreenCTM();
  if (!screenCTM) return { x: clientX, y: clientY };
  const transformed = point.matrixTransform(screenCTM.inverse());
  return { x: transformed.x, y: transformed.y };
};

export const getOwnerSvg = (target: EventTarget | null): SVGSVGElement | null => {
  if (!target || !(target instanceof Element)) return null;
  return (target as SVGGraphicsElement).ownerSVGElement || (target instanceof SVGSVGElement ? target : null);
};
