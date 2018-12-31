export { BaseRoutes } from "./BaseRoutes"
export { AuthRoutes } from "./AuthRoutes"
export { AssetRoutes } from "./AssetRoutes"
export { UserRoutes } from "./UserRoutes"
export { SystemRoutes } from "./SystemRoutes"
export { ShippingRoutes } from "./ShippingRoutes"
export { EventRoutes } from "./EventRoutes"
// Error handlers
import { mongooseValidation } from "../errorHandlers/mongooseValidation"
import { mongooseValidator } from "../errorHandlers/mongooseValidator"
import { httpErrorHandler } from "../errorHandlers/httpErrorHandler"
export const isProduction = process.env.NODE_ENV === "production"
const errorHandlers = [mongooseValidation, mongooseValidator, httpErrorHandler]
const unknownError = {
  code: 500,
  value: {
    errors: [{ errorType: "unknown", errorMessage: "Unknown Error." }],
  },
}

export function catchAll(routeHandler) {
  return async (req, res, next) => {
    try {
      await routeHandler(req, res, next)
    } catch (err) {
      // The default error response is an unknown error.
      let response = unknownError

      // Replace the default response with a custom error if one exists.
      for (let errorHandler of errorHandlers) {
        if (errorHandler.canHandleError(err)) {
          response = errorHandler.createResponse(err)
          break
        }
      }

      // Debug errors in development environment.
      if (!isProduction) {
        console.log(err)
      }

      res.status(response.code).json(response.value)
    }
  }
}
