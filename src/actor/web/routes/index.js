export { LogRoutes } from "./LogRoutes"

export function catchAll(routeHandler) {
  return async (req, res, next) => {
    try {
      await routeHandler(req, res, next)
    } catch (err) {
      if (err instanceof createError.HttpError) {
        next(err)
      } else {
        if (isProduction) {
          next(createError.InternalServerError(err.message))
        } else {
          next(err)
        }
      }
    }
  }
}
