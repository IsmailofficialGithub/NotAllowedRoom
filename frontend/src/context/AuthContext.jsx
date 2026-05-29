import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';

const AuthContext = createContext();

const cleanAuthValue = (value) => {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  return trimmed && trimmed !== 'undefined' && trimmed !== 'null' ? trimmed : '';
};

const normalizeUser = (userData) => {
  if (!userData) return null;
  const email = cleanAuthValue(userData.email);
  const name = cleanAuthValue(userData.name) || email;

  return {
    ...userData,
    name,
    email
  };
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [loading, setLoading] = useState(true);

  const API_URL = `${import.meta.env.VITE_BACKEND_URL}/api/v1/auth`;

  useEffect(() => {
    if (token) {
      // In a real app, you might want to verify the token with the backend here
      const savedUser = normalizeUser(JSON.parse(localStorage.getItem('user')));
      if (savedUser) {
        setUser(savedUser);
        localStorage.setItem('user', JSON.stringify(savedUser));
      }
    }
    setLoading(false);
  }, [token]);

  const login = async (email, password) => {
    try {
      const response = await axios.post(`${API_URL}/login`, { email, password });
      const { sessionToken, userId, name, email: responseEmail } = response.data;
      
      const userData = normalizeUser({
        id: userId,
        name,
        email: responseEmail || email
      });
      setToken(sessionToken);
      setUser(userData);
      
      localStorage.setItem('token', sessionToken);
      localStorage.setItem('user', JSON.stringify(userData));
      
      return { success: true };
    } catch (error) {
      return { 
        success: false, 
        message: error.response?.data?.message || 'Login failed' 
      };
    }
  };

  const register = async (name, email, password) => {
    try {
      await axios.post(`${API_URL}/register`, { name, email, password });
      return { success: true };
    } catch (error) {
      return { 
        success: false, 
        message: error.response?.data?.message || 'Registration failed' 
      };
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
