import type { NextFunction, Request, Response } from "express";

export const middleware = (req: Request, res: Response, next: NextFunction) => {
  try {
    const authorization = req.headers["authorization"];
    if (!authorization) {
      return res.status(401).json({
        status: "error",
        message: "Missing authorization header",
      });
    }

    const authSecret = process.env.AUTH_SECRET;

    if (!authSecret) {
      return res.status(401).json({
        status: "error",
        message: "authorization header please contact admin",
      });
    }

    if (authorization !== authSecret) {
      return res.status(401).json({
        status: "error",
        message: "Invalid authorization header",
      });
    }

    return next();

  } catch (error) {
    console.log("Error in the middleware");
    console.log(error);
    return res.status(512).json({
      status: "error",
      message: "Internal server error",
    })
  }

}
