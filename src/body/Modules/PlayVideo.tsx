import React, { useEffect, useState } from 'react';
import { Offcanvas } from 'react-bootstrap';
import { themes } from '../../constants/index.ts';
import { useTheme } from '../context/ThemeContext.js';
import TutoController from '../controllers/TutoController.js';

type Video = {
    title: string;
    uri: string;
};

const DEFAULT_TUTOS: Video[] = [
    { title: "Comment s'authentifier?", uri: "8SRSFLnAnsQ" },
    { title: "Comment manipuler un Patient ?", uri: "d6AjoZgDqLc" },
    { title: "Comment manipuler un Assistant, un Comptable(e) ou un(e) Secretaire ?", uri: "YowYEQEshRc" },
    { title: "Comment modifier son profile ?", uri: "4ac_nbBV0_E" },
    { title: "Comment manipuler un acte effectuer sur un patient ?", uri: "r9CPy8ynJ80" },
    { title: "Comment manipuler une nouvelle assurance ou un nouvel acte ?", uri: "8oqW-_T0LKQ" },
    { title: "Comment effectuer le payement d'un nouveau mois ?", uri: "BHMe8S6B1fw" },
    { title: "Comment fonctionne les qr code ?", uri: "5BPGZxImZGc" },
];

type PlayVideoProps = {
    color?: "current" | "violet" | "rouge" | "jaune";
    refreshKey?: number;
};

const PlayVideo: React.FC<PlayVideoProps> = ({ color, refreshKey = 0 }) => {
    const [isOffcanvasOpen, setIsOffcanvasOpen] = useState<boolean>(false);
    const { themeNumber } = useTheme();
    const [listeVideosUrl, setListeVideosUrl] = useState<Video[]>(DEFAULT_TUTOS);

    useEffect(() => {
        const load = async () => {
            try {
                const list = await TutoController().list();
                if (Array.isArray(list) && list.length > 0) {
                    setListeVideosUrl(list.map((t) => ({ title: t.titre, uri: t.url })));
                } else {
                    setListeVideosUrl(DEFAULT_TUTOS);
                }
            } catch {
                setListeVideosUrl(DEFAULT_TUTOS);
            }
        };
        load();
    }, [refreshKey]);
    const [uri, setUri] = useState<string>("");
    const [title, setTitle] = useState<string>("");

    const openOffcanvas = () => {
        setIsOffcanvasOpen(true);
    };

    const closeOffcanvas = () => {
        setIsOffcanvasOpen(false);
    };

    const lancerVideo = (theUrl: string, theTitle: string) => {
        setUri(theUrl);
        setTitle(theTitle);
    };

    return (
        <div className='m-4' style={{ width: "50%", cursor: "pointer" }}>
            <svg 
                onClick={openOffcanvas} 
                width="40" 
                height="40" 
                viewBox="0 0 24 24" 
                fill="none" 
                style={{ transition: "transform 0.2s", cursor: "pointer" }}
                onMouseEnter={(e) => e.currentTarget.style.transform = "scale(1.1)"}
                onMouseLeave={(e) => e.currentTarget.style.transform = "scale(1)"}
            >
                <circle cx="12" cy="12" r="10" stroke={themes[themeNumber].primary} strokeWidth="2" fill="none"/>
                <path d="M10 8l6 4-6 4V8z" fill={themes[themeNumber].primary}/>
            </svg>
            <Offcanvas 
                show={isOffcanvasOpen} 
                style={{ 
                    backgroundColor: '#f8f9fa', 
                    width: "85%",
                    maxWidth: "1400px"
                }} 
                onHide={closeOffcanvas}
                placement="end"
            >
                <Offcanvas.Header 
                    closeButton 
                    style={{ 
                        backgroundColor: themes[themeNumber].primary, 
                        borderBottom: `3px solid ${themes[themeNumber].secondary}`,
                        padding: "20px 30px"
                    }}
                >
                    <h3 style={{ 
                        color: themes[themeNumber].secondary, 
                        margin: 0, 
                        fontWeight: "bold",
                        display: "flex",
                        alignItems: "center",
                        gap: "12px"
                    }}>
                        📚 Tutoriels LoggAppro
                    </h3>
                </Offcanvas.Header>
                <Offcanvas.Body style={{ padding: 0, display: "flex", height: "100%" }}>
                    <div style={{ display: "flex", width: "100%", height: "100%" }}>
                        {/* Zone vidéo principale */}
                        <div style={{ flex: 1, padding: "30px", overflowY: "auto", backgroundColor: "#fff" }}>
                            {uri !== "" ? (
                                <div style={{ maxWidth: "1000px", margin: "0 auto" }}>
                                    <div style={{ 
                                        backgroundColor: "#fff", 
                                        borderRadius: "12px", 
                                        padding: "25px",
                                        boxShadow: "0 4px 12px rgba(0,0,0,0.08)"
                                    }}>
                                        <h4 style={{ 
                                            color: themes[themeNumber].primary, 
                                            marginBottom: "20px",
                                            fontSize: "24px",
                                            fontWeight: "600",
                                            display: "flex",
                                            alignItems: "center",
                                            gap: "10px"
                                        }}>
                                            🎥 {title}
                                        </h4>
                                        <div style={{ 
                                            position: "relative", 
                                            width: "100%",
                                            paddingBottom: "56.25%", 
                                            height: 0,
                                            borderRadius: "8px",
                                            overflow: "hidden",
                                            boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
                                            backgroundColor: "#000"
                                        }}>
                                            <iframe
                                                style={{
                                                    position: "absolute",
                                                    top: 0,
                                                    left: 0,
                                                    width: "100%",
                                                    height: "100%",
                                                    border: "none"
                                                }}
                                                src={`https://www.youtube-nocookie.com/embed/${uri}?rel=0&modestbranding=1&autoplay=0&mute=1`}
                                                title={title}
                                                allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                                                referrerPolicy="strict-origin-when-cross-origin"
                                                allowFullScreen
                                            />
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div style={{ 
                                    display: "flex", 
                                    flexDirection: "column",
                                    justifyContent: "center", 
                                    alignItems: "center",
                                    height: "100%",
                                    color: "#95a5a6",
                                    textAlign: "center"
                                }}>
                                    <div style={{ 
                                        fontSize: "80px", 
                                        marginBottom: "20px",
                                        opacity: 0.3
                                    }}>
                                        🎬
                                    </div>
                                    <h4 style={{ 
                                        fontSize: "22px", 
                                        fontWeight: "600",
                                        marginBottom: "10px",
                                        color: "#7f8c8d"
                                    }}>
                                        Bienvenue dans les tutoriels
                                    </h4>
                                    <p style={{ fontSize: "16px", color: "#95a5a6" }}>
                                        Sélectionnez un tutoriel dans la liste pour commencer
                                    </p>
                                </div>
                            )}
                        </div>

                        {/* Sidebar liste des vidéos */}
                        <div style={{ 
                            width: "350px", 
                            backgroundColor: themes[themeNumber].primary,
                            borderLeft: `3px solid ${themes[themeNumber].secondary}`,
                            overflowY: "auto",
                            padding: "20px"
                        }}>
                            <h5 style={{ 
                                color: themes[themeNumber].secondary, 
                                marginBottom: "20px",
                                fontSize: "16px",
                                fontWeight: "bold",
                                textTransform: "uppercase",
                                letterSpacing: "1px"
                            }}>
                                📋 Liste des tutoriels ({listeVideosUrl.length})
                            </h5>
                            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                                {listeVideosUrl.map((videoUrl, index) => (
                                    <div 
                                        key={index} 
                                        onClick={() => lancerVideo(videoUrl.uri, videoUrl.title)}
                                        style={{
                                            backgroundColor: uri === videoUrl.uri 
                                                ? themes[themeNumber].secondary 
                                                : "rgba(255,255,255,0.1)",
                                            color: uri === videoUrl.uri 
                                                ? themes[themeNumber].primary 
                                                : themes[themeNumber].secondary,
                                            padding: "15px",
                                            borderRadius: "8px",
                                            cursor: "pointer",
                                            transition: "all 0.3s ease",
                                            border: uri === videoUrl.uri 
                                                ? `2px solid ${themes[themeNumber].secondary}` 
                                                : "2px solid transparent",
                                            boxShadow: uri === videoUrl.uri 
                                                ? "0 4px 8px rgba(0,0,0,0.2)" 
                                                : "none"
                                        }}
                                        onMouseEnter={(e) => {
                                            if (uri !== videoUrl.uri) {
                                                e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.2)";
                                                e.currentTarget.style.transform = "translateX(5px)";
                                            }
                                        }}
                                        onMouseLeave={(e) => {
                                            if (uri !== videoUrl.uri) {
                                                e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.1)";
                                                e.currentTarget.style.transform = "translateX(0)";
                                            }
                                        }}
                                    >
                                        <div style={{ 
                                            display: "flex", 
                                            alignItems: "flex-start",
                                            gap: "10px"
                                        }}>
                                            <span style={{ 
                                                fontSize: "18px",
                                                fontWeight: "bold",
                                                minWidth: "25px"
                                            }}>
                                                {index + 1}.
                                            </span>
                                            <span style={{ 
                                                fontSize: "14px",
                                                lineHeight: "1.4",
                                                fontWeight: uri === videoUrl.uri ? "600" : "normal"
                                            }}>
                                                {videoUrl.title}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </Offcanvas.Body>
            </Offcanvas>
        </div>
    );
};

export default PlayVideo;
