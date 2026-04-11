import React from "react";
import Vfermer from "../../assets/svg/x-violet.svg";
import Bfermer from "../../assets/svg/x-white.svg";
import Nfermer from "../../assets/svg/x-black.svg";
import Jfermer from "../../assets/svg/x-yellow.svg";
import Rfermer from "../../assets/svg/x-red.svg";

type Props = {
    couleur: "blanc"|"noir"|"violet"|"jaune"|"rouge";
};

const BoutonFermer: React.FC<Props> = ({ couleur }) => {
    switch (couleur) {
        case "blanc":
            return <img src={Bfermer} alt="Fermer blanc" />;
        case "noir":
            return <img src={Nfermer} alt="Fermer noir" />;
        case "violet":
            return <img src={Vfermer} alt="Fermer violet" />;
        case "jaune":
            return <img src={Jfermer} alt="Fermer jaune" />;
        case "rouge":
            return <img src={Rfermer} alt="Fermer rouge" />;
        default:
            return <img src={Nfermer} alt="Fermer par défaut (noir)" />;
    }
};

export default BoutonFermer;
