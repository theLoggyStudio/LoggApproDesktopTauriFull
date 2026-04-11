import { useState } from "react";

export default function AssistantDto() {
  const [assistants, setAssistants] = useState([]);

    const apiKey = '1ce91f5e-a0fa-4c6a-91aa-0679777cc612'; 

  const fetchOptions = {
    headers: {
      'Authorization': `Basic ${btoa(`:${apiKey}`)}`,
      'Content-Type': 'application/json'
    }
  };

  const findAll = async () => {
    const response = await fetch('https://api.elephantsql.com/api/assistants');
    const data = await response.json();
    setAssistants(data);
  }

  const findById = async (id) => {
    const response = await fetch(`https://api.elephantsql.com/api/assistants/${id}`);
    const data = await response.json();
    return data;
  }

  const create = async (newAssistant) => {
    await fetch('https://api.elephantsql.com/api/assistants', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(newAssistant)
    });
  }

  const update = async (id, updatedAssistant) => {
    await fetch(`https://api.elephantsql.com/api/assistants/${id}`, {
      method: 'PUT',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(updatedAssistant)
    });
  }

  const remove = async (id) => {
    await fetch(`https://api.elephantsql.com/api/assistants/${id}`, {
      method: 'DELETE'
    });
  }

  return { create, findAll, findById, update, remove };
}
