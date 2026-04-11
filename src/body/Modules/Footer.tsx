import React from "react";
import { Container } from "react-bootstrap";
import { Link } from "react-router-dom";
import { themes } from "../../constants/index.ts";
import { useTheme } from '../context/ThemeContext.js';
import { TestBackendRust } from "./TestBackendRust.js";

const Footer = ({isAdmin=false}: { isAdmin?: boolean }) => {
  const { themeNumber } = useTheme();
  return (
    <footer style={{
      background: "rgba(255,255,255,0.85)",
      color: themes[themeNumber].primary,
      borderTop: `1px solid ${themes[themeNumber].primary}22`,
      fontSize: "0.95em",
      textAlign: "center",
      padding: "4px 0 2px 0",
      marginTop: "auto",
      letterSpacing: "0.02em"
    }}>
      <Container>
        <span style={{ opacity: 0.7 }}>
          © {new Date().getFullYear()} LoggyStudio
          {" | "}
          <Link to="/" style={{ color: themes[themeNumber].primary, textDecoration: "none", opacity: 0.6, marginLeft: 4 }}>LoggAppro</Link>
        </span>
        <TestBackendRust isAdmin={isAdmin} />
      </Container>
    </footer>
  );
};

export default Footer; 