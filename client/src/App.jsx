import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Provider } from 'react-redux';
import { store } from './app/store';

import AppLayout from './components/layout/AppLayout';
import Home from './pages/Home';
import Listings from './pages/Listings';
import Login from './pages/Login';
import Admin from './pages/Admin';

function App() {
  return (
    <Provider store={store}>
      <Router>
        <Routes>
          <Route path="/" element={<AppLayout />}>
            <Route index element={<Home />} />
            <Route path="listings" element={<Listings />} />
            <Route path="login" element={<Login />} />
            <Route path="admin" element={<Admin />} />
          </Route>
        </Routes>
      </Router>
    </Provider>
  );
}

export default App;
