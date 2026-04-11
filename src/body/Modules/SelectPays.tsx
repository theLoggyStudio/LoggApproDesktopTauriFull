import React, { useState, useEffect, useRef } from 'react';
import Select from 'react-select';
import CountryList from 'react-select-country-list';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const SelectPays = ({ onChange, id }) => {
  const [value, setValue] = useState(null);
  const [options, setOptions] = useState([]);
  const [isDisabled, setIsDisabled] = useState(true);
  const mapRef = useRef(null);
  const[theText,setTheText]=useState<string>('');

  useEffect(() => {
    const countryOptions = CountryList().getData();
    setOptions(countryOptions);

    const fetchLocation = async () => {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(async (position) => {
          const { latitude, longitude } = position.coords;
          try {
            const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=10&addressdetails=1`);
            const data = await response.json();
            const userCountryCode = data.address.country_code.toUpperCase();

            const defaultCountry = countryOptions.find(option => option.value === userCountryCode) || null;
            setValue(defaultCountry);
            if (onChange) {
              onChange(defaultCountry);
            }
            setIsDisabled(false);

            // Initialize map
            if (mapRef.current) {
              const map = L.map(mapRef.current).setView([latitude, longitude], 5);
              L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              }).addTo(map);

              const marker = L.marker([latitude, longitude]).addTo(map);
              marker.bindPopup(defaultCountry ? defaultCountry.label : 'Your location').openPopup();
            }
          } catch (error) {
            console.error('Error fetching location:', error);
          }
        }, (error) => {
          console.error('Error getting geolocation:', error);
        });
      } else {
        console.error('Geolocation is not supported by this browser.');
      }
    };

    fetchLocation();
  }, [onChange]);

  const changeHandler = async (selectedOption) => {
    setValue(selectedOption);
    if (onChange) {
      onChange(selectedOption);
    }
    if (selectedOption) {
      const response = await fetch(`https://nominatim.openstreetmap.org/search?country=${selectedOption.value}&format=json&limit=1`);
      const data = await response.json();
      if (data.length > 0 && mapRef.current) {
        const { lat, lon } = data[0];
        const map = L.map(mapRef.current).setView([lat, lon], 5);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }).addTo(map);
        const marker = L.marker([lat, lon]).addTo(map);
        marker.bindPopup(selectedOption.label).openPopup();
      }
    }
  };

  return (
    <div>
      <div className="row" style={{ color: "#5A28A5" }}>
        <Select
          options={options.length ? options : [{ value: "", label: "vide" }]}
          value={value}
          onChange={changeHandler}
          placeholder="Entrer le pays du cabinet"
          id={id}
          isDisabled={isDisabled}
        />
      </div>
      <div ref={mapRef} style={{ height: "400px", width: "100%", marginTop: "20px" }} />
    </div>
  );
};

export default SelectPays;
