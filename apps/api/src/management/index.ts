import { Router, Request } from "express";
import { z } from "zod";
import { asyncRoute, requireUser, roles } from "../core";
import {
  getScope,
  list,
  manifest,
  options,
  overview,
  resourceFor,
} from "./read";
import { cancel, mutate, remove } from "./write";
const router = Router();
for (const role of ["admin", "operator"] as const) {
  const r = Router(),
    scoped = (req: Request) => getScope(req.user!.id, role === "operator");
  r.use(requireUser, roles(role));
  r.get(
    "/overview",
    asyncRoute(async (req, res) => {
      res.json({ data: await overview(await scoped(req)) });
    }),
  );
  r.get(
    "/options",
    asyncRoute(async (req, res) => {
      const q = z
        .object({
          kind: z.string(),
          term: z.string().max(80).default(""),
          page: z.coerce.number().int().min(1).max(10000).default(1),
          operatorId: z.string().optional(),
        })
        .parse(req.query);
      res.json({
        data: await options(
          await scoped(req),
          q.kind,
          q.term,
          q.page,
          q.operatorId,
        ),
      });
    }),
  );
  r.get(
    "/trips/:id/manifest",
    asyncRoute(async (req, res) => {
      res.json({
        data: await manifest(await scoped(req), String(req.params.id)),
      });
    }),
  );
  r.post(
    "/bookings/:id/cancel",
    asyncRoute(async (req, res) => {
      res.json({
        data: await cancel(await scoped(req), String(req.params.id)),
      });
    }),
  );
  r.get(
    "/:resource",
    asyncRoute(async (req, res) => {
      const scope = await scoped(req),
        name = resourceFor(String(req.params.resource), scope);
      const { page, pageSize } = z
        .object({
          page: z.coerce.number().int().min(1).max(100000).default(1),
          pageSize: z.coerce.number().int().min(1).max(100).default(20),
        })
        .parse(req.query);
      res.json({ data: await list(scope, name, page, pageSize) });
    }),
  );
  r.post(
    "/:resource",
    asyncRoute(async (req, res) => {
      const scope = await scoped(req);
      res
        .status(201)
        .json({
          data: await mutate(
            scope,
            resourceFor(String(req.params.resource), scope),
            undefined,
            req.body,
          ),
        });
    }),
  );
  r.put(
    "/:resource/:id",
    asyncRoute(async (req, res) => {
      const scope = await scoped(req);
      res.json({
        data: await mutate(
          scope,
          resourceFor(String(req.params.resource), scope),
          String(req.params.id),
          req.body,
        ),
      });
    }),
  );
  r.delete(
    "/:resource/:id",
    asyncRoute(async (req, res) => {
      const scope = await scoped(req);
      res.json({
        data: await remove(
          scope,
          resourceFor(String(req.params.resource), scope),
          String(req.params.id),
        ),
      });
    }),
  );
  router.use("/" + role, r);
}
export default router;
