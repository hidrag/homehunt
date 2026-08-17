const Footer = () => {
  return (
    <footer className="border-t bg-gray-50 py-8">
      <div className="container mx-auto px-4 text-center text-sm text-gray-500">
        &copy; {new Date().getFullYear()} HomeHunt. All rights reserved.
      </div>
    </footer>
  );
};

export default Footer;
