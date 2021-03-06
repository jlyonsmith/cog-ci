export { LogRoutes } from "./LogRoutes"
export { WebhookRoutes } from "./WebhookRoutes"
export { ScheduleRoutes } from "./ScheduleRoutes"

export function catchAll(routeHandler) {
  return async (req, res, next) => {
    try {
      await routeHandler(req, res, next)
    } catch (err) {
      next(err)
    }
  }
}
