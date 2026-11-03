import { Router } from "express";

import authenticate from "../middleware/auth.middleware.js";
import { authorizeRoles } from "../middleware/role.middleware.js";

import {
  createBookmark,
  getAllBookmarks,
  getBookmarkById,
  deleteBookmark,
  updateBookmark,
  getRecentBookmarks,
  getRecentlyViewedBookmarks,
  getBookmarkedCourses,
  getBookmarkedCourseById,
  getAvailableBookmarkedCourses,
  getUnavailableBookmarkedCourses,
  getBookmarkedLessons,
  getBookmarkedLessonById,
  getRecentBookmarkedLessons,
  getBookmarkedResources,
  getBookmarkedNotes,
  getBookmarkedVideos,
  getBookmarkedDocuments,
  getBookmarkedArticles,
  getBookmarkedLinks,
  archiveBookmark,
  restoreBookmark,
  getArchivedBookmarks,
  getUncategorizedBookmarks,
  getBookmarkCollections,
  createBookmarkCollection,
  getBookmarkCollectionById,
  updateBookmarkCollection,
  deleteBookmarkCollection,
} from "../modules/bookmarks/bookmark.controller.js";

const bookmarkRouter = Router();

bookmarkRouter.use(authenticate);
bookmarkRouter.use(authorizeRoles("LEARNER"));

// 1. All Bookmarks
bookmarkRouter.get("/", getAllBookmarks);
bookmarkRouter.post("/", createBookmark);

// Recent bookmarks
bookmarkRouter.get("/recent", getRecentBookmarks);
bookmarkRouter.get("/recently-viewed", getRecentlyViewedBookmarks);

// 2. Course Bookmarks
bookmarkRouter.get("/courses", getBookmarkedCourses);
bookmarkRouter.get("/courses/recent", getRecentBookmarks);
bookmarkRouter.get("/courses/available", getAvailableBookmarkedCourses);
bookmarkRouter.get("/courses/unavailable", getUnavailableBookmarkedCourses);
bookmarkRouter.get("/courses/:courseId", getBookmarkedCourseById);

// 3. Lesson Bookmarks
bookmarkRouter.get("/lessons", getBookmarkedLessons);
bookmarkRouter.get("/lessons/recent", getRecentBookmarkedLessons);
bookmarkRouter.get("/lessons/:lessonId", getBookmarkedLessonById);

// 4. Learning Resource Bookmarks
bookmarkRouter.get("/resources", getBookmarkedResources);
bookmarkRouter.get("/notes", getBookmarkedNotes);
bookmarkRouter.get("/videos", getBookmarkedVideos);
bookmarkRouter.get("/documents", getBookmarkedDocuments);
bookmarkRouter.get("/articles", getBookmarkedArticles);
bookmarkRouter.get("/links", getBookmarkedLinks);

// 5. Bookmark Collections
bookmarkRouter.get("/collections", getBookmarkCollections);
bookmarkRouter.post("/collections", createBookmarkCollection);
bookmarkRouter.get("/collections/uncategorized", getUncategorizedBookmarks);
bookmarkRouter.get("/collections/archived", getArchivedBookmarks);
bookmarkRouter.get("/collections/:collectionId", getBookmarkCollectionById);
bookmarkRouter.patch("/collections/:collectionId", updateBookmarkCollection);
bookmarkRouter.delete("/collections/:collectionId", deleteBookmarkCollection);

// 6. Bookmark Management
bookmarkRouter.get("/:bookmarkId", getBookmarkById);
bookmarkRouter.patch("/:bookmarkId", updateBookmark);
bookmarkRouter.delete("/:bookmarkId", deleteBookmark);

bookmarkRouter.patch("/:bookmarkId/archive", archiveBookmark);
bookmarkRouter.patch("/:bookmarkId/restore", restoreBookmark);

export default bookmarkRouter;
