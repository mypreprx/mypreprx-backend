import topicModel from '../../../Models/topicSchema.js';
import crashCoursesModel from '../../../Models/CrashCourse.js';
import { formatDuration, generateThumbnail, getDuration, deleteFile, generatePdfThumbnail } from '../../../utilities/Duration&Thumbnail.js';
import fs from 'fs';
import { PDFDocument } from 'pdf-lib';
import path from 'path';
// export const addCrashCourseService = async (courseData, file) => {
export const addCrashCourseService = async (courseData, file, thumbnailFile) => {
  const { Title, topicId } = courseData;

  if (!file) {
    throw new Error("No file uploaded");
  }

  // const topicExists = await topicModel.findOne({ title: topicId });
  // --- FIX START: Changed from findOne({ title: ... }) to findById(...) ---
  const topicExists = await topicModel.findById(topicId);
  // --- FIX END ---
  if (!topicExists) {
    if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
    throw new Error("Topic not found");
  }

  const getFileType = (mime) => {
    if (mime.includes('video')) return 'video';
    if (mime.includes('pdf')) return 'pdf';
    if (mime.includes('image')) return 'image';
    return 'other';
  };

  const fileType = getFileType(file.mimetype);
  const filenameBase = path.parse(file.filename).name;

  let formattedDuration = '';
  let thumbnailPath = null;
  let durationRaw = 0;

  if (fileType === 'video') {
    // durationRaw = await getDuration(file.path);
    // formattedDuration = formatDuration(durationRaw);
    // thumbnailPath = await generateThumbnail(file.path, filenameBase);

    // Newly added
    durationRaw = await getDuration(file.path);
    formattedDuration = formatDuration(durationRaw);
    // FIX: Get thumbnail path and ensure it's relative
    const thumbPath = await generateThumbnail(file.path, filenameBase);
    // Convert to relative path if it's absolute
    if (path.isAbsolute(thumbPath)) {
      thumbnailPath = path.relative(process.cwd(), thumbPath).replace(/\\/g, "/");
    } else {
      thumbnailPath = thumbPath.replace(/\\/g, "/");
    }
  }
  else if (fileType === 'pdf') {
    // const pdfBuffer = fs.readFileSync(file.path);
    // const pdfDoc = await PDFDocument.load(pdfBuffer);
    // durationRaw = pdfDoc.getPageCount();
    // formattedDuration = `${durationRaw} Pages`;
    // thumbnailPath = await generatePdfThumbnail(file.path, filenameBase);

    // Newly added
    const pdfBuffer = fs.readFileSync(file.path);
    const pdfDoc = await PDFDocument.load(pdfBuffer);
    durationRaw = pdfDoc.getPageCount();
    formattedDuration = `${durationRaw} Pages`;
    // FIX: Get thumbnail path and ensure it's relative
    const thumbPath = await generatePdfThumbnail(file.path, filenameBase);
    // Convert to relative path if it's absolute
    if (path.isAbsolute(thumbPath)) {
      thumbnailPath = path.relative(process.cwd(), thumbPath).replace(/\\/g, "/");
    } else {
      thumbnailPath = thumbPath.replace(/\\/g, "/");
    }
  }
  else if (fileType === 'image') {
    // formattedDuration = 'Image';
    // thumbnailPath = `/uploads/${file.filename}`;

    // Newly added
    // FIX: For images, thumbnail should point to the actual image file
    formattedDuration = 'Image';
    const absolutePath = file.path;
    let relativeImagePath = path.relative(process.cwd(), absolutePath);
    thumbnailPath = relativeImagePath.replace(/\\/g, "/");
  }

  const absolutePath = file.path;
  let relativePath = path.relative(process.cwd(), absolutePath);
  relativePath = relativePath.replace(/\\/g, "/");

  // If user uploaded a custom thumbnail, use it instead of the auto-generated one
  if (thumbnailFile) {
    // Delete auto-generated thumbnail if it exists
    if (thumbnailPath) {
      deleteFile(thumbnailPath);
    }
    let relativeThumbPath = path.relative(process.cwd(), thumbnailFile.path);
    thumbnailPath = relativeThumbPath.replace(/\\/g, "/");
  }

  const newCourse = new crashCoursesModel({
    title: Title,
    fileUrl: relativePath,
    fileType: fileType,
    duration: formattedDuration,
    topicId: topicExists._id,
    thumbnail: thumbnailPath
  });

  const savedCourse = await newCourse.save();

  // --- FIX 2: Populate the topicId before returning ---
  // This ensures the Frontend gets the Topic Title immediately instead of "N/A"
  await savedCourse.populate('topicId');

  return savedCourse;
};

// export const updateCrashCourseService = async (courseId, courseData, newFile) => {
export const updateCrashCourseService = async (courseId, courseData, newFile, thumbnailFile) => {
  const { Title, topicId } = courseData;

  const course = await crashCoursesModel.findById(courseId);

  if (!course) {
    if (newFile && fs.existsSync(newFile.path)) fs.unlinkSync(newFile.path);
    throw new Error("Course not found");
  }

  if (Title) course.title = Title;

  if (topicId) {
    // const topicDoc = await topicModel.findOne({ title: topicId });
    // --- FIX START: Changed from findOne({ title: ... }) to findById(...) ---
    const topicDoc = await topicModel.findById(topicId);
    // --- FIX END ---
    if (topicDoc) {
      course.topicId = topicDoc._id;
    }
  }

  if (newFile) {
    deleteFile(course.fileUrl);
    deleteFile(course.thumbnail);

    const getFileType = (mime) => {
      if (mime.includes('video')) return 'video';
      if (mime.includes('pdf')) return 'pdf';
      if (mime.includes('image')) return 'image';
      return 'other';
    };

    const fileType = getFileType(newFile.mimetype);
    const filenameBase = path.parse(newFile.filename).name;

    let formattedDuration = '';
    let newThumbnailPath = null;
    let durationRaw = 0;

    if (fileType === 'video') {
      // durationRaw = await getDuration(newFile.path);
      // formattedDuration = formatDuration(durationRaw);
      // newThumbnailPath = await generateThumbnail(newFile.path, filenameBase);

      // Newly added
      durationRaw = await getDuration(newFile.path);
      formattedDuration = formatDuration(durationRaw);
      // FIX: Get thumbnail path and ensure it's relative
      const thumbPath = await generateThumbnail(newFile.path, filenameBase);
      // Convert to relative path if it's absolute
      if (path.isAbsolute(thumbPath)) {
        newThumbnailPath = path.relative(process.cwd(), thumbPath).replace(/\\/g, "/");
      } else {
        newThumbnailPath = thumbPath.replace(/\\/g, "/");
      }
    }
    else if (fileType === 'pdf') {
      // const pdfBuffer = fs.readFileSync(newFile.path);
      // const pdfDoc = await PDFDocument.load(pdfBuffer);
      // durationRaw = pdfDoc.getPageCount();
      // formattedDuration = `${durationRaw} Pages`;
      // newThumbnailPath = await generatePdfThumbnail(newFile.path, filenameBase);

      // Newly added
      const pdfBuffer = fs.readFileSync(newFile.path);
      const pdfDoc = await PDFDocument.load(pdfBuffer);
      durationRaw = pdfDoc.getPageCount();
      formattedDuration = `${durationRaw} Pages`;
      // FIX: Get thumbnail path and ensure it's relative
      const thumbPath = await generatePdfThumbnail(newFile.path, filenameBase);
      // Convert to relative path if it's absolute
      if (path.isAbsolute(thumbPath)) {
        newThumbnailPath = path.relative(process.cwd(), thumbPath).replace(/\\/g, "/");
      } else {
        newThumbnailPath = thumbPath.replace(/\\/g, "/");
      }
    }
    else if (fileType === 'image') {
      // formattedDuration = 'Image';
      // newThumbnailPath = `/uploads/${newFile.filename}`;

      // Newly added
      // FIX: For images, thumbnail should point to the actual image file
      formattedDuration = 'Image';
      const absolutePath = newFile.path;
      let relativeImagePath = path.relative(process.cwd(), absolutePath);
      newThumbnailPath = relativeImagePath.replace(/\\/g, "/");
    }

    let relativePath = path.relative(process.cwd(), newFile.path).replace(/\\/g, "/");

    course.fileUrl = relativePath;
    course.fileType = fileType;
    course.duration = formattedDuration;
    course.thumbnail = newThumbnailPath;
  }

  // If user uploaded a custom thumbnail, use it (even without a new main file)
  if (thumbnailFile) {
    // Delete old thumbnail
    deleteFile(course.thumbnail);
    let relativeThumbPath = path.relative(process.cwd(), thumbnailFile.path);
    course.thumbnail = relativeThumbPath.replace(/\\/g, "/");
  }

  const updatedCourse = await course.save();
  await updatedCourse.populate('topicId');

  return updatedCourse;
};

export const deleteCourseService = async (courseId) => {
  const courseToDelete = await crashCoursesModel.findById(courseId);

  if (!courseToDelete) {
    throw new Error("No course found");
  }

  deleteFile(courseToDelete.fileUrl);
  deleteFile(courseToDelete.thumbnail);

  await crashCoursesModel.findByIdAndDelete(courseId);

  return courseToDelete;
};

export const getAllCrashCoursesService = async () => {
  const courses = await crashCoursesModel.find().populate('topicId');
  return courses;
};
