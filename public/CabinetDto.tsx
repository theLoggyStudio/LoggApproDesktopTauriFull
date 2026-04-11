import { useState } from "react";


export default function CabinetDto() {
  const [cabinets, setCabinets] = useState([]);

    const apiKey = '1ce91f5e-a0fa-4c6a-91aa-0679777cc612'; 

  const fetchOptions = {
    headers: {
      'Authorization': `Basic ${btoa(`:${apiKey}`)}`,
      'Content-Type': 'application/json'
    }
  };

  const findAll = async () => {
    const response = await fetch('https://api.elephantsql.com/api/cabinets');
    const data = await response.json();
    setCabinets(data);
  }

  const findById = async (id) => {
    const response = await fetch(`https://api.elephantsql.com/api/cabinets/${id}`);
    const data = await response.json();
    return data;
  }

  const create = async (newCabinet) => {
    await fetch('https://api.elephantsql.com/api/cabinets', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(newCabinet)
    });
  }

  const update = async (id, updatedCabinet) => {
    await fetch(`https://api.elephantsql.com/api/cabinets/${id}`, {
      method: 'PUT',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(updatedCabinet)
    });
  }

  const remove = async (id) => {
    await fetch(`https://api.elephantsql.com/api/cabinets/${id}`, {
      method: 'DELETE'
    });
  }

  return { create, findAll, findById, update, remove };
}


