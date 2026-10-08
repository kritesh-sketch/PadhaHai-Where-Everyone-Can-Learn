function notFound(req, res) {
  return res
    .status(404)
    .json({ message: `Route ${req.method} ${req.path} not found` });
}

export default notFound;
