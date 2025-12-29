import React from 'react';
import { useParams } from 'react-router-dom';
import Whiteboard from '../../components/Whiteboard/Whiteboard';

export const WhiteboardPage: React.FC = () => {
  const { bookingId } = useParams<{ bookingId: string }>();

  if (!bookingId) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-red-500">Invalid booking ID</div>
      </div>
    );
  }

  return (
    <div className="w-full h-screen">
      <Whiteboard bookingId={bookingId} />
    </div>
  );
};

export default WhiteboardPage;
