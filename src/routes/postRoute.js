import { Router } from "express";
import { createPost, deletePost } from "../controllers/postController.js";
import { upload } from "../middlewares/multerMiddleware.js";

const router = Router();

router.post("/", upload.single("file"), createPost);
router.delete("/:id", deletePost);

export default router;